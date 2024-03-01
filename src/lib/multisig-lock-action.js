import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import { Script } from "@ckb-cobuild/ckb-molecule-codecs";
import { ScriptInfo } from "@ckb-cobuild/cobuild";
import mol, { createUint8ArrayJsonCodec, toJson } from "@ckb-cobuild/molecule";
import { SECP256K1_MULTISIG_CODE_HASH } from "./ckb-address.js";

export const PubkeyHash = createUint8ArrayJsonCodec(
  mol.byteArray("PubkeyHash", 20),
);
export const PubkeyHashVec = mol.vector("PubkeyHashVec", PubkeyHash);

export const Signature = createUint8ArrayJsonCodec(
  mol.byteArray("Signature", 65),
);
export const PubkeyHashSignaturePair = mol.struct(
  "PubkeyHashSignaturePair",
  {
    pubkey_hash: PubkeyHash,
    signature: Signature,
  },
  ["pubkey_hash", "signature"],
);
export const PubkeyHashSignaturePairVec = mol.vector(
  "PubkeyHashSignaturePairVec",
  PubkeyHashSignaturePair,
);

export const MultisigConfig = mol.table(
  "MultisigConfig",
  {
    require_first_n: mol.byte,
    threshold: mol.byte,
    signer_pubkey_hashes: PubkeyHashVec,
  },
  ["require_first_n", "threshold", "signer_pubkey_hashes"],
);

export const MultisigAction = mol.table(
  "MultisigAction",
  {
    config: MultisigConfig,
    signed: PubkeyHashSignaturePairVec,
  },
  ["config", "signed"],
);

export function buildScriptInfo() {
  return {
    name: "secp256k1_blake160_multisig_all",
    url: "https://github.com/nervosnetwork/ckb-system-scripts/blob/master/c/secp256k1_blake160_multisig_all.c",
    // Always use empty args to generate script hash
    script_hash: ckbHasher()
      .update(
        Script.pack({
          code_hash: SECP256K1_MULTISIG_CODE_HASH,
          hash_type: "type",
          args: Uint8Array.of(),
        }),
      )
      .digest(),
    schema: Array.from(MultisigAction.exportSchema().values()).join("\n"),
    message_type: "MultisigAction",
  };
}

export const SCRIPT_INFO = buildScriptInfo();
export const SCRIPT_INFO_HASH = ckbHasher()
  .update(ScriptInfo.pack(SCRIPT_INFO))
  .digest();

export function buildAction(lockArgs, actionData) {
  return {
    script_info_hash: SCRIPT_INFO_HASH,
    script_hash: ckbHasher()
      .update(
        Script.pack({
          code_hash: SECP256K1_MULTISIG_CODE_HASH,
          hash_type: "type",
          args: lockArgs,
        }),
      )
      .digest(),
    data: MultisigAction.pack(actionData),
  };
}
export function multisigStatus(actionData) {
  if (actionData.signed.length >= actionData.config.threshold) {
    for (const pubkeyHash of actionData.config.signer_pubkey_hashes.slice(
      0,
      actionData.config.require_first_n,
    )) {
      const pubkeyHashHex = toJson(pubkeyHash);
      if (
        actionData.signed.findIndex(
          (item) => toJson(item.pubkey_hash) === pubkeyHashHex,
        ) === -1
      ) {
        return "partially signed";
      }
    }
    return "ready";
  }

  return actionData.signed.length > 0 ? "partially signed" : "unsigned";
}
