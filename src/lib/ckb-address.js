import { utils as lumosBaseUtils } from "@ckb-lumos/base";
import * as lumosHelpers from "@ckb-lumos/helpers";

const { CKBHasher } = lumosBaseUtils;

export const SECP256K1_CODE_HASH =
  "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";

export const SECP256K1_MULTISIG_CODE_HASH =
  "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8";

export function checkSecp256k1Address(address) {
  try {
    const script = addressToScript(address);
    return (
      script.codeHash === SECP256K1_CODE_HASH &&
      script.hashType === "type" &&
      script.args.length === 42
    );
  } catch (error) {
    return false;
  }
}

export function addressToScript(address, options) {
  if (!options) {
    const prefix = address.startsWith("ckb")
      ? "ckb"
      : address.startsWith("ckt")
        ? "ckt"
        : null;
    if (prefix === null) {
      throw new Error(`Invalid CKB Address: ${address}`);
    }

    options = { config: { PREFIX: prefix } };
  }

  return lumosHelpers.addressToScript(address, options);
}

export function scriptToAddress(script, options) {
  if (typeof options === "string") {
    options = { config: { PREFIX: options } };
  }
  return lumosHelpers.encodeToAddress(script, options);
}

// multisig_script: S | R | M | N | PubKeyHash1 | PubKeyHash2 | ...
//
// +-------------+------------------------------------+-------+
// |             |           Description              | Bytes |
// +-------------+------------------------------------+-------+
// | S           | reserved field, must be zero       |     1 |
// | R           | first nth public keys must match   |     1 |
// | M           | threshold                          |     1 |
// | N           | total public keys                  |     1 |
// | PubkeyHashN | blake160 hash of compressed pubkey |    20 |
export function generateMultisigArgs(config) {
  const hasher = new CKBHasher();
  hasher.update(
    Uint8Array.of(0, config.required, config.threshold, config.signers.length),
  );
  for (const address of config.signers) {
    const script = addressToScript(address);
    hasher.update(script.args);
  }
  // first 20 bytes
  return hasher.digestHex().substring(0, 42);
}

export function generateMultisigAddress(config, prefix) {
  const script = {
    codeHash: SECP256K1_MULTISIG_CODE_HASH,
    hashType: "type",
    args: generateMultisigArgs(config),
  };

  return scriptToAddress(script, prefix);
}
