# Development Docs

## Start Local Dev Chain

Init a dev chain using the test account that has 20 billions of CKB tokens in the genesis block.

```bash
bin/init-dev-chain.sh
```

Import the test account into `ckb-cli` with empty password

```bash
echo 'd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc' > specs/miner.key
ckb-cli account import --privkey-path specs/miner.key </dev/null
```

Start the chain.

```bash
ckb run
```

Generate some blocks to make the CKB tokens in the genesis block available.

```
bin/generate-blocks.sh 20
```

## Faucet

```bash
bin/dev-faucet.sh ckt1qz...
```

Mine some blocks to commit the transfer transaction.

```bash
bin/generate-blocks.sh 3
```

Now it's OK to run the web app with the local dev chain. Start a dev miner process in another terminal window to commit transactions automatically:

```bash
bin/run-dev-miner.sh
```

Or run `bin/generate-blocks.sh 3` to commit transactions manually.
