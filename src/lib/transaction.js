import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import {
  RawTransaction,
  Script,
  Transaction,
  Uint64,
  WitnessArgs,
  getRawTransaction,
} from "@ckb-cobuild/ckb-molecule-codecs";
import { decodeHex, encodeHex } from "@ckb-cobuild/hex-encoding";
import { toJson } from "@ckb-cobuild/molecule";
import { ec as EC } from "elliptic";
import {
  SECP256K1_CODE_HASH,
  SECP256K1_MULTISIG_CODE_HASH,
  decodeCkbAddress,
  encodeDeprecatedSecp256k1Address,
} from "./ckb-address.js";
import { importMultisigAddresses } from "./multisig-address.js";
import {
  MultisigAction,
  SCRIPT_INFO,
  SCRIPT_INFO_HASH,
  buildAction,
} from "./multisig-lock-action.js";

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

function witnessFromNeuron(w) {
  if (w === null || w === undefined || typeof w === "string") {
    return w;
  }

  const { lock, inputType, outputType } = w;
  return toJson(
    WitnessArgs.pack(
      WitnessArgs.parse({
        lock: lock ?? null,
        input_type: inputType ?? null,
        output_type: outputType ?? null,
      }),
    ),
  );
}

export function importFromNeuron(jsonContent) {
  const payload = {
    hash: jsonContent.transaction.hash,
    witnesses: jsonContent.transaction.witnesses.map(witnessFromNeuron),
    version: toJson(parseInt(jsonContent.transaction.version, 10)),
    cell_deps: jsonContent.transaction.cellDeps.map((cd) => ({
      out_point: {
        tx_hash: cd.outPoint.txHash,
        index: toJson(parseInt(cd.outPoint.index, 10)),
      },
      dep_type: cd.depType === "depGroup" ? "dep_group" : "code",
    })),
    header_deps: jsonContent.transaction.headerDeps,
    inputs: jsonContent.transaction.inputs.map((item) => ({
      previous_output: {
        tx_hash: item.previousOutput.txHash,
        index: toJson(parseInt(item.previousOutput.index, 10)),
      },
      since: toJson(BigInt(item.since)),
    })),
    outputs: jsonContent.transaction.outputs.map((item) => ({
      capacity: toJson(BigInt(item.capacity)),
      lock: {
        args: item.lock.args,
        code_hash: item.lock.codeHash,
        hash_type: item.lock.hashType,
      },
      type: item.type
        ? {
            args: item.type.args,
            code_hash: item.type.codeHash,
            hash_type: item.type.hashType,
          }
        : null,
    })),
    outputs_data: jsonContent.transaction.outputs.map(
      (item) => item.data ?? "0x",
    ),
  };
  const lock_actions = [];
  const seenLockHash = new Set();
  for (const [index, item] of jsonContent.transaction.inputs.entries()) {
    if (
      item.lock.codeHash === SECP256K1_MULTISIG_CODE_HASH_HEX &&
      !seenLockHash.has(item.lockHash)
    ) {
      seenLockHash.add(item.lockHash);
      const witness = WitnessArgs.unpack(
        decodeHex(payload.witnesses[index].slice(2)),
      ).lock;
      const signers = [];
      for (let i = 0; i < witness[3]; ++i) {
        signers[i] = witness.subarray(4 + 20 * i, 4 + 20 * (i + 1));
      }
      lock_actions.push(
        toJson(
          buildAction(decodeHex(item.lock.args.slice(2)), {
            config: {
              require_first_n: witness[1],
              threshold: witness[2],
              signer_pubkey_hashes: signers,
            },
            signed: Array.from(
              jsonContent.transaction.signatures[item.lockHash].entries(),
            ).map(([i, pubkeyHash]) => ({
              pubkey_hash: decodeHex(pubkeyHash.slice(2)),
              signature: witness.subarray(
                4 + 20 * witness[3] + 65 * i,
                4 + 20 * witness[3] + 65 * (i + 1),
              ),
            })),
          }),
        ),
      );
    }
  }

  const buildingPacket = {
    type: "BuildingPacketV1",
    value: {
      message: { actions: [] },
      resolved_inputs: {
        outputs: jsonContent.transaction.inputs.map((item) => ({
          capacity: toJson(BigInt(item.capacity)),
          lock: {
            args: item.lock.args,
            code_hash: item.lock.codeHash,
            hash_type: item.lock.hashType,
          },
          type: item.type
            ? {
                args: item.type.args,
                code_hash: item.type.codeHash,
                hash_type: item.type.hashType,
              }
            : null,
        })),
        outputs_data: jsonContent.transaction.inputs.map(
          (item) => item.data ?? "0x",
        ),
      },
      change_output: null,
      script_infos: toJson([SCRIPT_INFO]),
      lock_actions,
      payload,
    },
  };

  const tx = {
    pendingSignatures: {},
    state: "pending",
    buildingPacket,
  };
  checkIsReady(tx);
  return tx;
}

export function importTransaction(jsonContent) {
  if (
    "transaction" in jsonContent &&
    "multisig_configs" in jsonContent &&
    "signatures" in jsonContent
  ) {
    return importFromCkbCli(jsonContent);
  } else if (
    "transaction" in jsonContent &&
    "signatures" in jsonContent["transaction"]
  ) {
    return importFromNeuron(jsonContent);
  } else if (jsonContent["type"] === "BuildingPacketV1") {
    return {
      pendingSignatures: {},
      state: "pending",
      buildingPacket: jsonContent,
    };
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
      for (const required of actionData.config.signer_pubkey_hashes.slice(
        0,
        actionData.config.require_first_n,
      )) {
        const requiredHex = encodeHex(required);
        if (
          actionData.config.signed.findIndex(
            (item) => encodeHex(item.pubkey_hash) === requiredHex,
          ) === -1
        ) {
          return false;
        }
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
      const existingData = MultisigAction.unpack(
        decodeHex(existing.data.slice(2)),
      );
      const newData = MultisigAction.unpack(
        decodeHex(lockAction.data.slice(2)),
      );
      for (const sig of newData.signed) {
        const newPubkeyHash = toJson(sig.pubkey_hash);
        const existingSigIndex = existingData.signed.findIndex(
          (item) => toJson(item.pubkey_hash) === newPubkeyHash,
        );
        if (existingSigIndex !== -1) {
          existingData.signed.splice(existingSigIndex, 1);
        }
        existingData.signed.push(sig);
      }
      existing.data = toJson(MultisigAction.pack(existingData));
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

export function exportBuildingPacket(bp, format) {
  if (format === "neuron") {
    const signatures = {};
    let fee = 0n;
    for (const output of bp.value.resolved_inputs.outputs) {
      fee = fee + BigInt(output.capacity);
    }
    for (const output of bp.value.payload.outputs) {
      fee = fee - BigInt(output.capacity);
    }
    for (const output of bp.value.resolved_inputs.outputs) {
      const lockHash =
        "0x" +
        ckbHasher()
          .update(Script.pack(Script.parse(output.lock)))
          .digest("hex");
      if (output.lock.code_hash === SECP256K1_CODE_HASH_HEX) {
        signatures[lockHash] = [output.lock.args];
      } else if (output.lock.code_hash === SECP256K1_MULTISIG_CODE_HASH_HEX) {
        const action = bp.value.lock_actions.find(
          (item) => item.script_hash === lockHash,
        );
        const da = toJson(
          MultisigAction.unpack(decodeHex(action.data.slice(2))),
        );
        signatures[lockHash] = da.signed.map((item) => item.pubkey_hash);
      }
    }
    return {
      transaction: {
        cellDeps: bp.value.payload.cell_deps.map((cd) => ({
          outPoint: {
            txHash: cd.out_point.tx_hash,
            index: parseInt(cd.out_point.index, 16).toString(),
          },
          depType: cd.dep_type === "dep_group" ? "depGroup" : "code",
        })),
        headerDeps: bp.value.payload.header_deps,
        inputs: Array.from(bp.value.payload.inputs.entries()).map(
          ([index, input]) => ({
            previousOutput: {
              txHash: input.previous_output.tx_hash,
              index: parseInt(input.previous_output.index, 16).toString(),
            },
            since: BigInt(input.since).toString(),
            capacity: BigInt(
              bp.value.resolved_inputs.outputs[index].capacity,
            ).toString(),
            lock: {
              args: bp.value.resolved_inputs.outputs[index].lock.args,
              codeHash: bp.value.resolved_inputs.outputs[index].lock.code_hash,
              hashType: bp.value.resolved_inputs.outputs[index].lock.hash_type,
            },
            type:
              bp.value.resolved_inputs.outputs[index].type !== null
                ? {
                    args: bp.value.resolved_inputs.outputs[index].type.args,
                    codeHash:
                      bp.value.resolved_inputs.outputs[index].type.code_hash,
                    hashType:
                      bp.value.resolved_inputs.outputs[index].type.hash_type,
                  }
                : null,
            lockHash:
              "0x" +
              ckbHasher()
                .update(
                  Script.pack(
                    Script.parse(bp.value.resolved_inputs.outputs[index].lock),
                  ),
                )
                .digest("hex"),
            data: bp.value.resolved_inputs.outputs_data[index],
          }),
        ),
        outputs: Array.from(bp.value.payload.outputs.entries()).map(
          ([index, output]) => ({
            capacity: BigInt(output.capacity).toString(),
            lock: {
              args: output.lock.args,
              codeHash: output.lock.code_hash,
              hashType: output.lock.hash_type,
            },
            type:
              output.type !== null
                ? {
                    args: output.type.args,
                    codeHash: output.type.code_hash,
                    hashType: output.type.hash_type,
                  }
                : null,
            lockHash:
              "0x" +
              ckbHasher()
                .update(Script.pack(Script.parse(output.lock)))
                .digest("hex"),
            data: bp.value.payload.outputs_data[index],
          }),
        ),
        witnesses: bp.value.payload.witnesses.map((w) => {
          if (w !== "0x") {
            const { lock, input_type, output_type } = toJson(
              WitnessArgs.unpack(decodeHex(w.slice(2))),
            );
            return {
              lock,
              inputType: input_type,
              outputType: output_type,
            };
          }
        }),
        description: "From Mulgisig Cobuild PoC",
        nervosDao: false,
        signatures,
        hash: bp.value.payload.hash,
        version: parseInt(bp.value.payload.version, 16).toString(),
        fee: fee.toString(),
        outputsData: bp.value.payload.outputs_data,
      },
      type: "SendFromMultisigOnlySig",
      status: "PartiallySigned",
      context: [bp.value.payload],
    };
  } else if (format === "ckb-cli") {
    // eslint-disable-next-line no-unused-vars
    const { hash, ...transaction } = bp.value.payload;
    const signatures = {};
    const multisig_configs = {};
    for (const output of bp.value.resolved_inputs.outputs) {
      if (
        output.lock.code_hash === SECP256K1_MULTISIG_CODE_HASH_HEX &&
        !(output.lock.args in multisig_configs)
      ) {
        const lockHash =
          "0x" +
          ckbHasher()
            .update(Script.pack(Script.parse(output.lock)))
            .digest("hex");
        const action = bp.value.lock_actions.find(
          (item) => item.script_hash === lockHash,
        );
        const da = toJson(
          MultisigAction.unpack(decodeHex(action.data.slice(2))),
        );
        multisig_configs[output.lock.args] = {
          sighash_addresses: da.config.signer_pubkey_hashes.map((args) =>
            encodeDeprecatedSecp256k1Address(args),
          ),
          require_first_n: parseInt(da.config.require_first_n, 16),
          threshold: parseInt(da.config.threshold, 16),
        };
        signatures[output.lock.args] = da.signed.map((item) => item.signature);
      }
    }

    return {
      transaction,
      signatures,
      multisig_configs,
    };
  }

  return bp;
}
