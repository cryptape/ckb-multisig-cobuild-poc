import {
  Transaction,
  getRawTransaction,
  RawTransaction,
} from "@ckb-cobuild/ckb-molecule-codecs";
import { toJson } from "@ckb-cobuild/molecule";
import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import {
  buildAction,
  SCRIPT_INFO,
  SCRIPT_INFO_HASH,
  MultisigConfig,
} from "./multisig-lock-action.js";
import { convertDeprecatedSecp256k1Address } from "./multisig-address.js";
import { decodeCkbAddress } from "./ckb-address.js";

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
    pendingSecp256k1Signatures: jsonContent.signatures,
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

export function resolvePendingSecp256k1Signatures(transaction) {
  // TODO: implement
  return transaction;
}

export function mergeTransaction(target, from) {
  // 1. Merge lockActions
  for (const lockAction of from.buildingPacket.value.lock_actions) {
    // Assume that Action.script_hash must be unique
    const existing = target.buildingPacket.value.lock_actions.find(
      (item) => item.script_hash === lockAction.script_hash,
    );
    if (existing === undefined) {
      target.buildingPacket.value.lock_actions.push(lockAction);
    } else if (lockAction.script_info_hash != toJson(SCRIPT_INFO_HASH)) {
      // non-multisig lock action, just overwrite
      Object.assign(existing, lockAction);
    } else {
      const existingData = MultisigConfig.unpack(existing.data);
      const newData = MultisigConfig.unpack(lockAction.data);
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
    }
  }

  // 2. Merge pendingSecp256k1Signatures
  for (const [args, signatures] of Object.entries(
    from.pendingSecp256k1Signatures,
  )) {
    if (args in target.pendingSecp256k1Signatures) {
      for (const signature of signatures) {
        if (!target.pendingSecp256k1Signatures[args].includes(signature)) {
          target.pendingSecp256k1Signatures[args].push(signature);
        }
      }
    } else {
      target.pendingSecp256k1Signatures[args] = signatures;
    }
  }

  // 3. Merge witnesses
  for (const [i, witness] of from.buildingPacket.value.payload.witnesses) {
    if (witness !== null && witness !== undefined && witness !== "0x") {
      target.buildingPacket.value.payload.witnesses[i] = witness;
    }
  }

  if (target.buildingPacket.value.resolved_inputs.outputs.length > 0) {
    resolvePendingSecp256k1Signatures(target);
  }
}