import { Script } from "@ckb-cobuild/ckb-molecule-codecs";
import { createJsonRpcClient } from "@ckb-cobuild/jsonrpc-client";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Label,
  TextInput,
} from "flowbite-react";
import { useState } from "react";
import DeleteButton from "./components/DeleteButton.js";
import { encodeCkbAddress } from "./lib/ckb-address.js";
import { groupByLockScript } from "./lib/transaction.js";

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

function LockGroupDetails({ group }) {
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
    </dl>
  );
}

function TransactionDetails({ transaction }) {
  const groups = groupByLockScript(transaction.buildingPacket);
  return (
    <Accordion className="mb-4">
      {Array.from(groups.entries()).map(([scriptHash, group]) => (
        <Accordion.Panel key={`lock-group-${scriptHash}`}>
          <Accordion.Title>
            <LockGroupTitle group={group} />
          </Accordion.Title>
          <Accordion.Content>
            <LockGroupDetails key={scriptHash} group={group} />
          </Accordion.Content>
        </Accordion.Panel>
      ))}
    </Accordion>
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

  return (
    <section className="mb-8">
      <h2 className="text-lg mb-4">
        Transaction <code className="break-all">{hash}</code>
      </h2>
      {hasPendingSignatures ? (
        <ResolveInputs {...{ endpoint, transaction, resolveInputs }} />
      ) : (
        <TransactionDetails {...{ transaction }} />
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
