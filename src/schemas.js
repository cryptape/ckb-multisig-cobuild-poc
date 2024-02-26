import { z } from "zod";
import { addressToScript } from "@ckb-lumos/helpers";
import { utils as lumosBaseUtils } from "@ckb-lumos/base";

const { CKBHasher } = lumosBaseUtils;

const SECP256K1_CODE_HASH =
  "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";

function checkSecp256k1Address(address) {
  try {
    const script = parseAddress(address);
    return (
      script.codeHash === SECP256K1_CODE_HASH &&
      script.hashType === "type" &&
      script.args.length == 42
    );
  } catch (error) {
    return false;
  }
}

function parseAddress(address) {
  const prefix = address.startsWith("ckb")
    ? "ckb"
    : address.startsWith("ckt")
      ? "ckt"
      : null;
  if (prefix === null) {
    throw new Error(`Invalid CKB Address: ${address}`);
  }

  return addressToScript(address, { config: { PREFIX: prefix } });
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
function generateMultisigArgs(config) {
  const hasher = new CKBHasher();
  hasher.update(
    Uint8Array.of(0, config.required, config.threshold, config.signers.length),
  );
  for (const address of config.signers) {
    const script = parseAddress(address);
    hasher.update(script.args);
  }
  // first 20 bytes
  return hasher.digestHex().substring(0, 42);
}

export const Address = z.string().refine(checkSecp256k1Address, {
  message: "invalid CKB secp256k1 address",
});

export const MultisigConfig = z
  .object({
    args: z.string(),
    signers: z.array(Address).nonempty().max(256),
    required: z.coerce.number().int().min(0).max(256),
    threshold: z.coerce.number().int().min(1).max(256),
  })
  .superRefine((val, ctx) => {
    if (val.threshold > val.signers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: val.signers.length,
        type: "number",
        inclusive: true,
        path: ["threshold"],
        message:
          "threshold must be less than or equal to the number of signers",
      });
    }
    if (val.required > val.threshold) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: val.threshold,
        type: "number",
        inclusive: true,
        path: ["required"],
        message: "required must be less than or equal to the threshold",
      });
    }
  })
  .transform((val) => ({
    ...val,
    args: generateMultisigArgs(val),
  }));
