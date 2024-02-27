import { buildScriptInfo, buildAction } from "./multisig-lock-action.js";
import { toJson } from "@ckb-cobuild/molecule";
import { decodeHex } from "@ckb-cobuild/hex-encoding";

test("buildScriptInfo", () => {
  const { schema, ...remaining } = buildScriptInfo();

  expect(schema).toMatch(
    `
array PubkeyHash [byte; 20];
vector PubkeyHashVec <PubkeyHash>;
table MultisigConfig {
    require_first_n: byte,
    threshold: byte,
    signer_pubkey_hashes: PubkeyHashVec,
}
array Signature [byte; 65];
struct PubkeyHashSignaturePair {
    pubkey_hash: PubkeyHash,
    signature: Signature,
}
vector PubkeyHashSignaturePairVec <PubkeyHashSignaturePair>;
table MultisigAction {
    config: MultisigConfig,
    signed: PubkeyHashSignaturePairVec,
}
    `.trim(),
  );
  expect(toJson(remaining)).toMatchSnapshot();
});

test("buildAction", () => {
  const action = buildAction(
    decodeHex("4cb239d9575deb2f62c998b74e7f0a8ee12daaaa"),
    {
      config: {
        require_first_n: 0,
        threshold: 2,
        signer_pubkey_hashes: [
          decodeHex("2910442b8955ddcc0d4c43919b2c98d7e5435434"),
          decodeHex("c8328aabcd9b9e8e64fbc566c4385c3bdeb219d7"),
          decodeHex("a656b9d66546084489ca979d95ca8d78ceb6764b"),
        ],
      },
      signed: [
        {
          pubkey_hash: decodeHex("2910442b8955ddcc0d4c43919b2c98d7e5435434"),
          signature: decodeHex(
            "743ea11867222e96da5b27dbdd63cec1bae3217e6a6c71a2a60abe602f43e7273f3cb25e88b6d00c19ea1dcb155dfd282a610e49d7a6e115aa8a058b451ca4a001",
          ),
        },
      ],
    },
  );
  expect(toJson(action)).toMatchSnapshot();
});
