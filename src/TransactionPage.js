import { createJsonRpcClient } from "@ckb-cobuild/jsonrpc-client";
import { Alert, Button, Label, TextInput } from "flowbite-react";
import { useState } from "react";
import DeleteButton from "./components/DeleteButton.js";

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

function TransactionDetails() {
  // TODO: TransactionDetails
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
        <TransactionDetails />
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
