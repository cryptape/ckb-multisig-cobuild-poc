import { useState, useEffect } from "react";
import { Button, Alert, Label, TextInput } from "flowbite-react";
import { createJsonRpcClient } from "@ckb-cobuild/jsonrpc-client";

function shouldSend(txState) {
  if (txState === null || txState === undefined) {
    return true;
  }
  const status = txState.tx_status.status;
  return status === "unknown" || status === "rejected";
}

async function sendTx(endpoint, payload) {
  const client = createJsonRpcClient(endpoint);
  const txState = await client.get_transaction(payload.hash, "0x1", false);

  if (shouldSend(txState)) {
    // eslint-disable-next-line no-unused-vars
    const { hash, ...req } = payload;
    await client.send_transaction(req);
    return {
      status: "pending",
    };
  } else {
    return txState.tx_status;
  }
}

function considerPoolRejectedDuplicatedTransactionAsPending(data) {
  const { status, reason } = data;
  const reasonString = reason ?? "";
  if (status === "rejected" && reasonString.indexOf("-1107") !== -1) {
    return {
      status: "pending",
      reason: null,
    };
  }

  return data;
}

function decorateData(data) {
  return considerPoolRejectedDuplicatedTransactionAsPending(data);
}

function isDone({ status }) {
  return status === "committed" || status === "rejected";
}

function sendUntilDone(endpoint, tx, setState) {
  if (endpoint === null) {
    return;
  }

  let aborted = false;
  let timeout = null;

  const fn = () => {
    sendTx(endpoint, tx)
      .then((data) => {
        if (!aborted) {
          const decoratedData = decorateData(data);
          if (!isDone(decoratedData)) {
            setState({
              isProcessing: true,
              endpoint: endpoint,
              data: decoratedData,
              error: null,
            });
            timeout = setTimeout(fn, 3000);
          } else {
            setState({
              isProcessing: false,
              endpoint: null,
              data: decoratedData,
              error: null,
            });
          }
        }
      })
      .catch((error) => {
        setState({
          isProcessing: false,
          endpoint: null,
          data: null,
          error: `Error while broadcasting: ${error}`,
        });
      });
  };
  fn();

  return () => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    aborted = true;
  };
}

export default function BroadcastTransactionPage({
  transaction,
  endpoint,
  setTransactionStatus,
}) {
  const hash = transaction.buildingPacket.value.payload.hash;

  const [state, setState] = useState({
    isProcessing: false,
    endpoint: null,
    data: null,
    error: null,
  });
  useEffect(
    () =>
      sendUntilDone(
        state.endpoint,
        transaction.buildingPacket.value.payload,
        setState,
      ),
    [state.endpoint, transaction.buildingPacket.value.payload, setState],
  );
  useEffect(() => {
    if (
      state.data !== null &&
      (state.data.status === "committed" || state.data.status === "rejected")
    ) {
      setTransactionStatus(endpoint, hash, state.data.status);
    }
  }, [hash, state.data]);

  const submit = async (e) => {
    e.preventDefault();
    const endpoint = new FormData(e.target).get("endpoint");
    setState({ ...state, endpoint, isProcessing: true, error: null });
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg mb-4">
        Broadcast Transaction <code className="break-all">{hash}</code>
      </h2>
      {state.error ? (
        <Alert className="mb-4" color="failure">
          {state.error}
        </Alert>
      ) : null}
      {state.data ? (
        state.data.status === "committed" ? (
          <Alert className="mb-4" color="success">
            Committed!
          </Alert>
        ) : state.data.status === "rejected" ? (
          <Alert className="mb-4" color="failure">
            Rejected: {state.data.reason}
          </Alert>
        ) : null
      ) : null}
      <form onSubmit={submit}>
        <div className="mb-4">
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

        <div className="mb-4 flex flex-row gap-2 flex-wrap">
          <Button
            type="submit"
            isProcessing={state.isProcessing}
            disabled={
              state.isProcessing ||
              (transaction.state !== "ready" &&
                transaction.state !== "committed" &&
                transaction.state !== "rejected")
            }
          >
            Broadcast
          </Button>
          <Button outline color="light" as="a" href={`#/transactions/${hash}`}>
            Go Back
          </Button>
        </div>
      </form>
    </section>
  );
}
