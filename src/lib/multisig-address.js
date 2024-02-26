import { MultisigConfig } from "../schemas.js";
import {
  decodeDeprecatedSecp256k1Address,
  encodeCkbAddress,
} from "./ckb-address.js";

export function convertDeprecatedSecp256k1Address(addresses) {
  return addresses.map((address) => {
    const decoded = decodeDeprecatedSecp256k1Address(address);
    return decoded === undefined
      ? address
      : encodeCkbAddress(decoded, address.slice(0, 3));
  });
}

export function importMultisigAddresses(jsonContent) {
  const found = [];

  if ("multisig_configs" in jsonContent) {
    for (const [args, value] of Object.entries(jsonContent.multisig_configs)) {
      found.push(
        MultisigConfig.parse({
          args,
          signers: convertDeprecatedSecp256k1Address(value.sighash_addresses),
          required: value.require_first_n,
          threshold: value.threshold,
        }),
      );
    }
  }

  if (found.length === 0) {
    throw new Error("No multisg configs found in the file");
  }
  return found;
}
