import { ckbHasher } from "@ckb-cobuild/ckb-hasher";
import { Script } from "@ckb-cobuild/ckb-molecule-codecs";
import { decodeHex } from "@ckb-cobuild/hex-encoding";
import { createJsonRpcClient } from "@ckb-cobuild/jsonrpc-client";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Label,
  Tabs,
  TextInput,
  Tooltip,
  Radio,
} from "flowbite-react";
import { useMemo, useState } from "react";
import { HiDownload, HiOutlineInformationCircle } from "react-icons/hi";
import DeleteButton from "./components/DeleteButton.js";
import { SECP256K1_CODE_HASH, encodeCkbAddress } from "./lib/ckb-address.js";
import { multisigStatus } from "./lib/multisig-lock-action";
import { groupByLockScript, exportTransaction } from "./lib/transaction.js";

function isEmpty(obj) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

function ResolveInputs({ endpoint, transaction, resolveInputs }) {
  const [state, setState] = useState({
    isProcessing: false,
    error: null,
  });

  const submit = async (e) => {
    e.preventDefault();

    const endpoint = new FormData(e.target).get("endpoint");

    setState({ isProcessing: true, error: null });
    try {
      const resolvedInputs = { outputs: [], outputs_data: [] };
      const client = createJsonRpcClient(endpoint);
      for (const [
        i,
        input,
      ] of transaction.buildingPacket.value.payload.inputs.entries()) {
        const cell = await client.get_live_cell(input.previous_output, true);
        if (cell.cell === null) {
          throw new Error(
            `Cannot find the live cell ${
              input.previous_output.tx_hash
            }#${parseInt(input.previous_output.index, 16)}`,
          );
        }
        resolvedInputs.outputs[i] = cell.cell.output;
        resolvedInputs.outputs_data[i] = cell.cell.data.content;
      }

      resolveInputs(
        endpoint,
        transaction.buildingPacket.value.payload.hash,
        resolvedInputs,
      );
      setState({ isProcessing: false, error: null });
    } catch (error) {
      console.error(error.stack);
      setState({
        isProcessing: false,
        error: `Failed to resolve inputs: ${error}`,
      });
    }
  };

  return (
    <>
      <Alert className="mb-4">
        The transaction is imported from ckb-cli and lacks of resolved inputs
        information. Please use a CKB JSONRPC node to resolve the inputs.
      </Alert>

      <form onSubmit={submit} className="flex flex-col gap-4 mb-8">
        <h3 className="text-lg mb-4">Resolve Inputs</h3>
        {state.error ? (
          <Alert className="mb-4" color="failure">
            {state.error}
          </Alert>
        ) : null}

        <div>
          <div className="mb-2 block">
            <Label htmlFor="endpoint" value="CKB JSONRPC URL" />
          </div>
          <TextInput
            id="endpoint"
            name="endpoint"
            required
            sizing="md"
            defaultValue={endpoint}
          />
        </div>

        <Button
          isProcessing={state.isProcessing}
          disabled={state.isProcessing}
          type="submit"
        >
          Connect
        </Button>
      </form>
    </>
  );
}

const KNOWN_SCRIPT_NAME = {
  "0x00000000000000000000000000000000000000000000000000545950455f4944":
    "typeid",
  "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8":
    "secp256k1_blake160",
  "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8":
    "secp256k1_blake160_multisig",
  "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e": "dao",
};

function shortAddress(address) {
  return address.length <= 29
    ? address
    : `${address.slice(0, 13)}...${address.slice(address.length - 13)}`;
}

function LockGroupTitle({ group }) {
  const lockScript = (group.inputs[0] ?? group.outputs[0]).output.lock;
  const lockScriptName = KNOWN_SCRIPT_NAME[lockScript.code_hash] ?? "unknown";
  const mainnetAddress = encodeCkbAddress(Script.parse(lockScript), "ckb");
  return (
    <>
      <code className="break-all font-mono">
        {shortAddress(mainnetAddress)}
      </code>
      <Badge className="ml-4 inline-block">{lockScriptName}</Badge>
    </>
  );
}

function formatCapacity(capacity, options = {}) {
  capacity = BigInt(capacity);
  return (Number(capacity) / 100000000).toLocaleString(undefined, {
    ...options,
    minimumFractionDigits: 8,
  });
}

function formatBalance(capacity, options = {}) {
  return formatCapacity(capacity, { signDisplay: "always", ...options });
}

const STATE_COLORS = {
  pending: "yellow",
  ready: "green",
  unsigned: "yellow",
  "partially signed": "yellow",
};

function LockGroupStatus({ txHash, scriptHash, group }) {
  const badge = useMemo(() => {
    const lockScript = (group.inputs[0] ?? group.outputs[0]).output.lock;
    const lockScriptName = KNOWN_SCRIPT_NAME[lockScript.code_hash] ?? "unknown";
    if (group.inputs.length == 0) {
      return;
    }

    if (lockScriptName === "secp256k1_blake160") {
      const status =
        group.witness && group.witness != "0x" ? "signed" : "unsigned";
      return (
        <Badge className="inline-block" color={STATE_COLORS[status]}>
          {status}
        </Badge>
      );
    }
    if (lockScriptName === "secp256k1_blake160_multisig") {
      const status = multisigStatus(group.multisigActionData);
      return (
        <Badge className="inline-block" color={STATE_COLORS[status]}>
          {status}
        </Badge>
      );
    }
  }, [txHash, scriptHash]);

  return badge ? (
    <div className="py-3 sm:grid sm:grid-cols-4">
      <dt>Status</dt>
      <dd className="sm:col-span-3">{badge}</dd>
    </div>
  ) : null;
}

function isAssetCell(cell) {
  return cell.output.type !== null || cell.data !== "0x";
}

function LockGroupDetails({ txHash, scriptHash, group }) {
  const { mainnetAddress, testnetAddress, balance } = useMemo(() => {
    const lockScript = (group.inputs[0] ?? group.outputs[0]).output.lock;
    const mainnetAddress = encodeCkbAddress(Script.parse(lockScript), "ckb");
    const testnetAddress = encodeCkbAddress(Script.parse(lockScript), "ckt");
    let balance = BigInt(0);
    for (const input of group.inputs) {
      balance = balance - BigInt(input.output.capacity);
    }
    for (const output of group.outputs) {
      balance = balance + BigInt(output.output.capacity);
    }

    return { mainnetAddress, testnetAddress, balance };
  }, [txHash, scriptHash]);

  return (
    <dl className="px-4 divide-y divide-gray-100">
      <div className="py-3 sm:grid sm:grid-cols-4">
        <dt>Mainnet Address</dt>
        <dd className="sm:col-span-3">
          <code className="break-all font-mono">{mainnetAddress}</code>
        </dd>
      </div>
      <div className="py-3 sm:grid sm:grid-cols-4">
        <dt>Testnet Address</dt>
        <dd className="sm:col-span-3">
          <code className="break-all font-mono">{testnetAddress}</code>
        </dd>
      </div>
      <div className="py-3 sm:grid sm:grid-cols-4">
        <dt>CKB Balance</dt>
        <dd className="sm:col-span-3">
          <code className="break-all font-mono">{formatBalance(balance)}</code>
        </dd>
      </div>
      <LockGroupStatus txHash={txHash} scriptHash={scriptHash} group={group} />
      {group.multisigActionData ? (
        <MultisigActionDataDetails data={group.multisigActionData} />
      ) : null}
      {group.inputs.findIndex(isAssetCell) !== -1 ? (
        <InputAssetsList inputs={group.inputs.filter(isAssetCell)} />
      ) : null}
      {group.outputs.findIndex(isAssetCell) !== -1 ? (
        <OutputAssetsList
          txHash={txHash}
          outputs={group.outputs.filter(isAssetCell)}
        />
      ) : null}
    </dl>
  );
}

function OutPoint({ txHash, index }) {
  return (
    <div className="inline-block mr-2">
      <Tooltip content={`${txHash}#${parseInt(index, 16)}`}>
        <code className="font-mono break-all">
          {txHash.slice(0, 15)}...{txHash.slice(txHash.length - 15)}#
          {parseInt(index, 16)}
        </code>
      </Tooltip>
    </div>
  );
}

function TypeScript({ script }) {
  return (
    <Badge className="inline-block mr-2">
      <Tooltip content={<pre>{JSON.stringify(script, null, 2)}</pre>}>
        type:
        {script !== null
          ? KNOWN_SCRIPT_NAME[script.code_hash] ?? "unknown"
          : "none"}
      </Tooltip>
    </Badge>
  );
}

function Data({ data }) {
  const dataHash =
    data !== "0x"
      ? "0x" +
        ckbHasher()
          .update(decodeHex(data.slice(2)))
          .digest("hex")
      : null;

  return (
    <Badge className="inline-block mr-2">
      {dataHash ? (
        <Tooltip content={dataHash}>
          H(data):...{dataHash.slice(dataHash.length - 7)}
        </Tooltip>
      ) : (
        <span>data:0x</span>
      )}
    </Badge>
  );
}

function InputAssetsList({ inputs }) {
  return (
    <div className="py-3">
      <dt className="font-semibold text-lg text-center">Assets Given Away</dt>
      <dd>
        <ul className="px-4 divide-y divide-gray-100">
          {inputs.map((cell) => (
            <li
              key={`${cell.input.previous_output.tx_hash}-${cell.input.previous_output.index}`}
            >
              <OutPoint
                txHash={cell.input.previous_output.tx_hash}
                index={cell.input.previous_output.index}
              />
              <TypeScript script={cell.output.type} />
              <Data data={cell.data} />
              CKB-{formatCapacity(`${cell.output.capacity}`)}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

function OutputAssetsList({ txHash, outputs }) {
  return (
    <div className="py-3">
      <dt className="font-semibold text-lg text-center">Assets Received</dt>
      <dd>
        <ul className="px-4 divide-y divide-gray-100">
          {outputs.map((cell) => (
            <li key={`${txHash}-${cell.index}`}>
              <OutPoint txHash={txHash} index={cell.index} />
              <TypeScript script={cell.output.type} />
              <Data data={cell.data} />
              CKB{formatBalance(cell.output.capacity)}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

function MultisigActionDataDetails({ data }) {
  const signers = data.config.signer_pubkey_hashes.map((args) => {
    const script = Script.parse({
      code_hash: SECP256K1_CODE_HASH,
      hash_type: "type",
      args,
    });
    return {
      args,
      testnet: encodeCkbAddress(script, "ckt"),
      mainnet: encodeCkbAddress(script, "ckb"),
    };
  });

  return (
    <div className="py-3">
      <dt className="font-semibold text-lg text-center">
        Multisig ({parseInt(data.config.threshold, 16)}/
        {data.config.signer_pubkey_hashes.length})
      </dt>
      <dd>
        <ol className="list-decimal">
          {Array.from(signers.entries()).map(
            ([index, { args, mainnet, testnet }]) => (
              <li className="mb-2" key={mainnet}>
                <div className="inline-block mr-2">
                  <Tooltip
                    content={
                      <>
                        <p>{mainnet}</p>
                        <p>{testnet}</p>
                      </>
                    }
                  >
                    <code className="font-mono break-all">
                      {shortAddress(mainnet)}
                    </code>
                  </Tooltip>
                </div>
                {index <= data.config.require_first_n ? (
                  <Badge className="inline-block mr-2">required</Badge>
                ) : null}
                {data.signed.findIndex((item) => item.pubkey_hash === args) ===
                -1 ? (
                  <Badge className="inline-block mr-2" color="yellow">
                    unsigned
                  </Badge>
                ) : (
                  <Badge className="inline-block mr-2" color="green">
                    signed
                  </Badge>
                )}
              </li>
            ),
          )}
        </ol>
      </dd>
    </div>
  );
}

function TransactionDetails({ transaction }) {
  const groups = useMemo(
    () => groupByLockScript(transaction.buildingPacket),
    [transaction.buildingPacket],
  );

  return (
    <Accordion className="mb-4">
      {Array.from(groups.entries()).map(([scriptHash, group]) => (
        <Accordion.Panel key={`lock-group-${scriptHash}`}>
          <Accordion.Title>
            <LockGroupTitle group={group} />
          </Accordion.Title>
          <Accordion.Content>
            <LockGroupDetails
              key={scriptHash}
              txHash={transaction.buildingPacket.value.payload.hash}
              scriptHash={scriptHash}
              group={group}
            />
          </Accordion.Content>
        </Accordion.Panel>
      ))}
    </Accordion>
  );
}

function ExportTransaction({ transaction }) {
  const [format, setFormat] = useState("building-packet");
  const fileName = `${transaction.buildingPacket.value.payload.hash}-${format}.json`;
  const file = new Blob(
    [JSON.stringify(exportTransaction(transaction, format), null, 2)],
    { type: "text/plain" },
  );

  return (
    <>
      <h3 className="mb-4">Export</h3>

      <fieldset className="flex max-w-md flex-col gap-4 mb-4">
        <legend className="mb-4">Choose the format</legend>
        <div className="flex items-top gap-2">
          <Radio
            id="export-building-packet"
            name="format"
            value="building-packet"
            checked={format === "building-packet"}
            onChange={() => setFormat("building-packet")}
          />
          <Label htmlFor="export-building-packet">
            <p className="font-semibold">Building Packet</p>
            <p>
              Share this format and this web page to signers so they can choose
              the tools to sign the tx
            </p>
          </Label>
        </div>
        <div className="flex items-top gap-2">
          <Radio
            id="export-ckb-cli"
            name="format"
            value="ckb-cli"
            checked={format === "ckb-cli"}
            onChange={() => setFormat("ckb-cli")}
          />
          <Label htmlFor="export-ckb-cli">
            <p className="font-semibold">ckb-cli</p>
            <p>Sign the downloaded file using `ckb-cli tx sign-inputs`</p>
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Radio
            id="export-neuron"
            name="format"
            value="neuron"
            checked={format === "neuron"}
            onChange={() => setFormat("neuron")}
          />
          <Label htmlFor="export-neuron">
            <p className="font-semibold">Neuron</p>
            <p>Sign the downloaded file using Neuron Multisig Address Tool</p>
          </Label>
        </div>
      </fieldset>

      <p className="mb-8">
        <Button
          className="inline-block"
          outlined
          as="a"
          download={fileName}
          target="_blank"
          rel="noreferrer"
          href={URL.createObjectURL(file)}
        >
          Download
        </Button>
      </p>
    </>
  );
}

export default function TransactionPage({
  transaction,
  deleteTransaction,
  navigate,
  endpoint,
  resolveInputs,
}) {
  const hasPendingSignatures = !isEmpty(transaction.pendingSignatures);
  const hash = transaction.buildingPacket.value.payload.hash;
  const state = (
    <Badge className="inline-block" color={STATE_COLORS[transaction.state]}>
      {transaction.state}
    </Badge>
  );

  return (
    <section className="mb-8">
      <h2 className="text-lg mb-4">
        Transaction <code className="break-all">{hash}</code>
      </h2>
      <dl className="px-4 divide-y divide-gray-100">
        <div className="py-3 sm:grid sm:grid-cols-4">
          <dt>Status</dt>
          <dd className="sm:col-span-3">{state}</dd>
        </div>
      </dl>
      {hasPendingSignatures ? (
        <ResolveInputs {...{ endpoint, transaction, resolveInputs }} />
      ) : (
        <Tabs>
          <Tabs.Item
            active
            title="Transaction"
            icon={HiOutlineInformationCircle}
          >
            <TransactionDetails {...{ transaction }} />
          </Tabs.Item>
          <Tabs.Item title="Download for Signing" icon={HiDownload}>
            <ExportTransaction {...{ transaction }} />
          </Tabs.Item>
        </Tabs>
      )}
      <div className="mb-4 flex flex-row gap-2 flex-wrap">
        <DeleteButton
          onClick={() => {
            deleteTransaction(hash);
            navigate("#/");
          }}
        />
        <Button outline color="light" as="a" href="#/">
          Go Back
        </Button>
      </div>
    </section>
  );
}
