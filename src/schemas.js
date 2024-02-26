import { encodeHex } from "@ckb-cobuild/hex-encoding";
import { z } from "zod";
import {
  checkSecp256k1Address,
  generateMultisigArgs,
} from "./lib/ckb-address.js";

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
    args: `0x${encodeHex(generateMultisigArgs(val))}`,
  }));
