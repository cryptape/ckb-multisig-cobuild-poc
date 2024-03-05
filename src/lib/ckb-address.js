import { encodeCkbAddress, decodeCkbAddress } from "@ckb-cobuild/ckb-address";
import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import { decodeHex } from "@ckb-cobuild/hex-encoding";
import { bech32 } from "bech32";

export { encodeCkbAddress, decodeCkbAddress };

export function arrayEqual(a, b) {
  if (a.length === b.length) {
    for (let i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  return false;
}

export const SECP256K1_CODE_HASH = decodeHex(
  "9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
);

export const SECP256K1_MULTISIG_CODE_HASH = decodeHex(
  "5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
);

export function checkSecp256k1Address(address) {
  try {
    const script = decodeCkbAddress(address);
    return (
      arrayEqual(script.code_hash, SECP256K1_CODE_HASH) &&
      script.hash_type === "type" &&
      script.args.length === 20
    );
  } catch (error) {
    return false;
  }
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
  const hasher = ckbHasher();
  hasher.update(
    Uint8Array.of(0, config.required, config.threshold, config.signers.length),
  );
  for (const address of config.signers) {
    const script = decodeCkbAddress(address);
    hasher.update(script.args);
  }
  // first 20 bytes
  return hasher.digest().subarray(0, 20);
}

export function generateMultisigAddress(config, prefix) {
  const script = {
    code_hash: SECP256K1_MULTISIG_CODE_HASH,
    hash_type: "type",
    args: generateMultisigArgs(config),
  };

  return encodeCkbAddress(script, prefix);
}

export function decodeDeprecatedSecp256k1Address(address) {
  try {
    const { prefix, words } = bech32.decode(address, 1023);
    if (prefix !== "ckb" && prefix !== "ckt") {
      return;
    }

    const [formatType, ...body] = bech32.fromWords(words);

    // payload = 0x01 | code_hash_index | args
    if (formatType === 1) {
      const [shortId, ...args] = body;
      // secp256k1
      if (shortId === 0 && args.length === 20) {
        return {
          code_hash: SECP256K1_CODE_HASH,
          hash_type: "type",
          args: Uint8Array.from(args),
        };
      }
    }
  } catch (_error) {
    // ignore
  }
}

export function encodeDeprecatedSecp256k1Address(args) {
  const data = [1, 0, ...Array.from(decodeHex(args.slice(2)))];
  const words = bech32.toWords(data);
  return bech32.encode("ckt", words, 1023);
}
