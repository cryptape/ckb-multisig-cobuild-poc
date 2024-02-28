import {
  Transaction,
  getRawTransaction,
  RawTransaction,
} from "@ckb-cobuild/ckb-molecule-codecs";
import { toJson } from "@ckb-cobuild/molecule";
import { decodeHex } from "@ckb-cobuild/hex-encoding";
import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import {
  SCRIPT_INFO,
  SCRIPT_INFO_HASH,
  MultisigConfig,
} from "./multisig-lock-action.js";

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

  // If the tx file has any input with the secp256k1 lock, it's impossible to restore the witnesses.

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
      // The tx file does not contain the resolved inputs. Without resolved inputs, it's impossible to compute the sighash. And without sighash, we cannot recover the pubkey.
      lock_actions: [],
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
  const lockActions = [];
  const witnesses = [];

  // TODO: handle pending signatures

  mergeLockActions(transaction, lockActions);
  mergeWitnesses(transaction, witnesses);
  checkIsReady(transaction);
}

export function isReady(transaction) {
  if (Array.from(Object.entries(transaction.pendingSignatures)).length > 0) {
    return false;
  }

  for (const lockAction of transaction.buildingPacket.value.lock_actions) {
    if (lockAction.script_info_hash == toJson(SCRIPT_INFO_HASH)) {
      const actionData = MultisigConfig.unpack(
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
    } else if (lockAction.script_info_hash !== toJson(SCRIPT_INFO_HASH)) {
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
        const newPubKeyHash = toJson(sig.pubkey_hash);
        const existingSigIndex = existingData.findIndex(
          (item) => toJson(item.pubkey_hash) === newPubKeyHash,
        );
        if (existingSigIndex !== -1) {
          existingData.signed.splice(existingSigIndex, 1);
        }
        existingData.signed.push(sig);
      }
      existing.data = toJson(MultisigConfig.pack(existingData));
    }
  }
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
