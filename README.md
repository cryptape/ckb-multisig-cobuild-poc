# CKB Multisig CoBuild PoC

[Contributing Guidelines](docs/CONTRIBUTING.md)

## Disclaimer

This is a Proof-of-Concept demo to show how to use the building packet lock actions in [CoBuild](https://talk.nervos.org/t/ckb-transaction-cobuild-protocol-overview/7702) to collect multisig signatures.

## Background

This PoC utilizes the CoBuild building packet as an intermediate format for enabling collaboration among various tools in the collection of multisig signatures. Currently, it supports ckb-cli and Neuron.

CoBuild enables lock scripts to include their pending actions in the `lock_actions` field of the building packet.

This PoC defines `MultisigAction` to store the mulgisig config and collected signatures.

```
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
```

## Getting Started

First, run the development server:

```bash
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This will use the testnet and the public RPC node `https://testnet.ckbapp.dev/`. See [docs/dev.md](docs/dev.md) about how to set up a dev chain for local development and testing.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

See the list of configurable environment variables in the file [env.example](env.example).
