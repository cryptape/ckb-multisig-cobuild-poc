import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import {
  RawTransaction,
  Script,
  Transaction,
  WitnessArgs,
  getRawTransaction,
  Uint64,
} from "@ckb-cobuild/ckb-molecule-codecs";
import { decodeHex } from "@ckb-cobuild/hex-encoding";
import { toJson } from "@ckb-cobuild/molecule";
import {
  SECP256K1_CODE_HASH,
  SECP256K1_MULTISIG_CODE_HASH,
  decodeCkbAddress,
} from "./ckb-address.js";
import { importMultisigAddresses } from "./multisig-address.js";
import {
  MultisigAction,
  MultisigConfig,
  SCRIPT_INFO,
  SCRIPT_INFO_HASH,
  buildAction,
} from "./multisig-lock-action.js";
import { ec as EC } from "elliptic";

const SCRIPT_INFO_HASH_HEX = toJson(SCRIPT_INFO_HASH);
const SECP256K1_CODE_HASH_HEX = toJson(SECP256K1_CODE_HASH);
const SECP256K1_MULTISIG_CODE_HASH_HEX = toJson(SECP256K1_MULTISIG_CODE_HASH);

function computeScriptHash(script) {
  return (
    "0x" +
    ckbHasher()
      .update(Script.pack(Script.parse(script)))
      .digest("hex")
  );
}

/**
 * Import transaction from the ckb-cli tx JSON.
 *
 * Pay attention to following two issues:
 *
 * 1. There's no resolved inputs in the ckb-cli JSON. The transaction page need a feature to load resolved inputs from a CKB node via JSONRPC.
 * 2. It does not who have provided the signature tell the signature. Fortunately, the pubkey can be recovered from the signature via `ecrecover`.
 */
export function importFromCkbCli(jsonContent) {
  const payload = Transaction.parse({
    hash: `0x${"0".repeat(64)}`,
    ...jsonContent.transaction,
  });
  payload.hash = ckbHasher()
    .update(RawTransaction.pack(getRawTransaction(payload)))
    .digest();

  const multisigAddresses = importMultisigAddresses(jsonContent);
  const lock_actions = multisigAddresses.map((addr) => {
    return buildAction(decodeHex(addr.args.slice(2)), {
      config: {
        require_first_n: addr.required,
        threshold: addr.threshold,
        signer_pubkey_hashes: addr.signers.map(
          (addr) => decodeCkbAddress(addr).args,
        ),
      },
      signed: [],
    });
  });

  const buildingPacket = {
    type: "BuildingPacketV1",
    value: {
      message: { actions: [] },
      // There's no resolved inputs info in ckb-cli tx.json
      resolved_inputs: {
        outputs: [],
        outputs_data: [],
      },
      change_output: null,
      script_infos: [SCRIPT_INFO],
      lock_actions,
      payload,
    },
  };

  return toJson({
    pendingSignatures: jsonContent.signatures,
    state: "pending",
    buildingPacket,
  });
}

export function importTransaction(jsonContent) {
  if (
    "transaction" in jsonContent &&
    "multisig_configs" in jsonContent &&
    "signatures" in jsonContent
  ) {
    return importFromCkbCli(jsonContent);
  }
  throw new Error("Unknown JSON format");
}

export function checkIsReady(transaction) {
  if (transaction.state === "pending" && isReady(transaction)) {
    transaction.state = "ready";
  }
}

export function resolvePendingSignatures(transaction) {
  const witnesses = [];

  for (const [
    i,
    output,
  ] of transaction.buildingPacket.value.resolved_inputs.outputs.entries()) {
    const lockArgs = output.lock.args;
    if (lockArgs in transaction.pendingSignatures) {
      if (output.lock.code_hash === SECP256K1_CODE_HASH_HEX) {
        const signature = transaction.pendingSignatures[lockArgs][0];
        delete transaction.pendingSignatures[lockArgs];
        if (signature !== undefined) {
          witnesses[i] = toJson(
            WitnessArgs.pack(
              WitnessArgs.parse({
                lock: signature,
                input_type: null,
                output_type: null,
              }),
            ),
          );
        }
      } else if (output.lock.code_hash === SECP256K1_MULTISIG_CODE_HASH_HEX) {
        const scriptHash = computeScriptHash(output.lock);
        const lockAction = transaction.buildingPacket.value.lock_actions.find(
          (item) => item.script_hash === scriptHash,
        );
        if (lockAction === undefined) {
          throw new Error(`Unknown multisig config for ${lockArgs}`);
        }
        const actionData = MultisigAction.unpack(
          decodeHex(lockAction.data.slice(2)),
        );
        for (const signature of transaction.pendingSignatures[lockArgs]) {
          const pubkeyHash = recoverPubkeyHash(
            transaction,
            lockArgs,
            actionData.config,
            signature,
          );
          const existingSigIndex = actionData.signed.findIndex(
            (item) => toJson(item.pubkey_hash) === pubkeyHash,
          );
          if (existingSigIndex !== -1) {
            actionData.signed.splice(existingSigIndex, 1);
          }
          actionData.signed.push({
            signature: decodeHex(signature.slice(2)),
            pubkey_hash: decodeHex(pubkeyHash.slice(2)),
          });
        }
        lockAction.data = toJson(MultisigAction.pack(actionData));
        delete transaction.pendingSignatures[lockArgs];
      }
    }
  }

  mergeWitnesses(transaction, witnesses);
  updateMultisigWitnesses(transaction);
  checkIsReady(transaction);
}

export function isReady(transaction) {
  if (Array.from(Object.entries(transaction.pendingSignatures)).length > 0) {
    return false;
  }

  for (const lockAction of transaction.buildingPacket.value.lock_actions) {
    if (lockAction.script_info_hash === SCRIPT_INFO_HASH_HEX) {
      const actionData = MultisigAction.unpack(
        decodeHex(lockAction.data.slice(2)),
      );
      if (actionData.signed.length < actionData.config.threshold) {
        return false;
      }
    }
  }

  return true;
}

function mergeLockActions(target, lockActions) {
  for (const lockAction of lockActions) {
    // Assume that Action.script_hash must be unique
    const existing = target.buildingPacket.value.lock_actions.find(
      (item) => item.script_hash === lockAction.script_hash,
    );
    if (existing === undefined) {
      target.buildingPacket.value.lock_actions.push(lockAction);
    } else if (lockAction.script_info_hash !== SCRIPT_INFO_HASH_HEX) {
      // non-multisig lock action, just overwrite
      Object.assign(existing, lockAction);
    } else {
      const existingData = MultisigConfig.unpack(
        decodeHex(existing.data.slice(2)),
      );
      const newData = MultisigConfig.unpack(
        decodeHex(lockAction.data.slice(2)),
      );
      for (const sig of newData.signed) {
        const newPubkeyHash = toJson(sig.pubkey_hash);
        const existingSigIndex = existingData.findIndex(
          (item) => toJson(item.pubkey_hash) === newPubkeyHash,
        );
        if (existingSigIndex !== -1) {
          existingData.signed.splice(existingSigIndex, 1);
        }
        existingData.signed.push(sig);
      }
      existing.data = toJson(MultisigConfig.pack(existingData));
    }
  }

  updateMultisigWitnesses(target);
}

function mergeWitnesses(target, witnesses) {
  for (const [i, witness] of witnesses) {
    if (witness !== null && witness !== undefined && witness !== "0x") {
      target.buildingPacket.value.payload.witnesses[i] = witness;
    }
  }
}

export function mergeTransaction(target, from) {
  mergeLockActions(target, from.buildingPacket.value.lock_actions);

  // Merge pending signatures
  for (const [args, signatures] of Object.entries(from.pendingSignatures)) {
    if (args in target.pendingSignatures) {
      for (const signature of signatures) {
        if (!target.pendingSignatures[args].includes(signature)) {
          target.pendingSignatures[args].push(signature);
        }
      }
    } else {
      target.pendingSignatures[args] = signatures;
    }
  }

  mergeWitnesses(target, from.buildingPacket.value.payload.witnesses);

  if (target.buildingPacket.value.resolved_inputs.outputs.length > 0) {
    resolvePendingSignatures(target);
  } else {
    checkIsReady(target);
  }
}

function computeMultisigSighash(tx, lockArgs, multisigConfig) {
  const hasher = ckbHasher();
  hasher.update(decodeHex(tx.buildingPacket.value.payload.hash.slice(2)));

  const lockWitness = new Uint8Array(
    4 +
      20 * multisigConfig.signer_pubkey_hashes.length +
      65 * multisigConfig.threshold,
  );
  lockWitness[1] = multisigConfig.required;
  lockWitness[2] = multisigConfig.threshold;
  lockWitness[3] = multisigConfig.signer_pubkey_hashes.length;
  for (const [i, pubkeyHash] of multisigConfig.signer_pubkey_hashes.entries()) {
    lockWitness.set(pubkeyHash, 4 + 20 * i);
  }

  const witness = WitnessArgs.pack({
    lock: lockWitness,
    input_type: null,
    output_type: null,
  });
  hasher.update(Uint64.pack(BigInt(witness.length)));
  hasher.update(witness);

  let isFirst = true;
  for (const output of tx.buildingPacket.value.resolved_inputs.outputs) {
    if (output.lock.args === lockArgs) {
      if (isFirst) {
        isFirst = false;
      } else {
        // empty witness
        hasher.update(Uint64.pack(0n));
      }
    }
  }

  for (const witness of tx.buildingPacket.value.payload.witnesses.slice(
    tx.buildingPacket.value.payload.inputs.length,
  )) {
    const witnessBuf = decodeHex(witness.slice(2));
    hasher.update(Uint64.pack(BigInt(witnessBuf.length)));
    hasher.update(witnessBuf);
  }

  return hasher.digest();
}

function recoverPubkeyHash(tx, lockArgs, multisigConfig, signature) {
  const sighash = computeMultisigSighash(tx, lockArgs, multisigConfig);
  const signatureBuf = decodeHex(signature.slice(2));
  const recid = signatureBuf[64];
  const ec = new EC("secp256k1");
  const pubkey = Uint8Array.from(
    ec
      .recoverPubKey(
        sighash,
        { r: signatureBuf.subarray(0, 32), s: signatureBuf.subarray(32, 64) },
        recid,
        "hex",
      )
      .encodeCompressed(),
  );
  return "0x" + ckbHasher().update(pubkey).digest("hex").slice(0, 40);
}

function updateMultisigWitnesses(tx) {
  for (const lockAction of tx.buildingPacket.value.lock_actions) {
    if (lockAction.script_info_hash === SCRIPT_INFO_HASH_HEX) {
      const actionData = MultisigAction.unpack(
        decodeHex(lockAction.data.slice(2)),
      );

      for (const [
        inputIndex,
        output,
      ] of tx.buildingPacket.value.resolved_inputs.outputs.entries()) {
        const scriptHash = computeScriptHash(output.lock);
        if (scriptHash === lockAction.script_hash) {
          const lockWitness = new Uint8Array(
            4 +
              20 * actionData.config.signer_pubkey_hashes.length +
              65 * actionData.signed.length,
          );
          lockWitness[1] = actionData.config.required;
          lockWitness[2] = actionData.config.threshold;
          lockWitness[3] = actionData.config.signer_pubkey_hashes.length;
          for (const [
            i,
            pubkeyHash,
          ] of actionData.config.signer_pubkey_hashes.entries()) {
            lockWitness.set(pubkeyHash, 4 + 20 * i);
          }
          for (const [i, s] of actionData.signed.entries()) {
            lockWitness.set(
              s.signature,
              4 + 20 * actionData.config.signer_pubkey_hashes.length + 65 * i,
            );
          }
          const witness = toJson(
            WitnessArgs.pack({
              lock: lockWitness,
              input_type: null,
              output_type: null,
            }),
          );
          while (
            tx.buildingPacket.value.payload.witnesses.length <= inputIndex
          ) {
            tx.buildingPacket.value.payload.witnesses.push("0x");
          }
          tx.buildingPacket.value.payload.witnesses[inputIndex] = witness;
        }
      }
    }
  }
}

export function groupByLockScript(buildingPacketJson) {
  const map = new Map();
  for (const [
    index,
    output,
  ] of buildingPacketJson.value.resolved_inputs.outputs.entries()) {
    const scriptHash = computeScriptHash(output.lock);
    const cell = {
      index,
      output,
      data: buildingPacketJson.value.resolved_inputs.outputs_data[index],
      input: buildingPacketJson.value.payload.inputs[index],
    };
    if (map.has(scriptHash)) {
      map.get(scriptHash).inputs.push(cell);
    } else {
      map.set(scriptHash, {
        inputs: [cell],
        outputs: [],
      });
    }
  }

  for (const [
    index,
    output,
  ] of buildingPacketJson.value.payload.outputs.entries()) {
    const scriptHash = computeScriptHash(output.lock);
    const cell = {
      index,
      output,
      data: buildingPacketJson.value.payload.outputs_data[index],
    };
    if (map.has(scriptHash)) {
      map.get(scriptHash).outputs.push(cell);
    } else {
      map.set(scriptHash, {
        inputs: [],
        outputs: [cell],
      });
    }
  }

  for (const group of map.values()) {
    if (group.inputs.length > 0) {
      group.witness =
        buildingPacketJson.value.payload.witnesses[group.inputs[0].index] ??
        "0x";
    }
  }

  for (const lockAction of buildingPacketJson.value.lock_actions) {
    const group = map.get(lockAction.script_hash);
    group.multisigActionData = toJson(
      MultisigAction.unpack(decodeHex(lockAction.data.slice(2))),
    );
  }

  return map;
}

export function exportTransaction(tx) {
  return tx.buildingPacket;
}
