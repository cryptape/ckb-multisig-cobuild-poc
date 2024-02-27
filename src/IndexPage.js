import { Button } from "flowbite-react";
import DeleteButton from "./components/DeleteButton.js";

function AddressesList({ navigate, addresses, deleteAddress }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg border-b-2 mb-4">Mulgisig Addresses</h2>
      <ul className="mb-4">
        {addresses.map((address) => (
          <li
            key={`address-${address.args}`}
            className="font-mono flex flex-row gap-2 items-center p-2 hover:bg-slate-100"
          >
            <a className="grow break-all" href={`#/addresses/${address.args}`}>
              {address.args}
            </a>
            <DeleteButton onClick={() => deleteAddress(address.args)} />
          </li>
        ))}
      </ul>
      <div className="mb-4 flex flex-row gap-2 flex-wrap">
        <Button onClick={() => navigate("#/addresses/new")}>Add Address</Button>
        <Button onClick={() => navigate("#/addresses/import")}>
          Import Addresses
        </Button>
      </div>
    </section>
  );
}

const IMPORT_PAGE = "#/transactions/import";

function TransactionsList({ navigate }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg border-b-2 mb-4">Transactions</h2>
      <div className="mb-8 flex flex-row gap-2 flex-wrap">
        <Button onClick={() => navigate(IMPORT_PAGE)}>
          Import Transaction
        </Button>
      </div>

      <h3 className="mb-2">The Workflow</h3>
      <ol className="mb-4 list-decimal list-inside">
        <li>
          The Initiator creates the multisig transaction using{" "}
          <code>ckb-cli tx</code> subcommand, or Neuron multisig address tool
          found in the Tools menu.
        </li>
        <li>
          The Initiator{" "}
          <a
            className="text-blue-600 dark:text-blue-500 hover:underline"
            href={IMPORT_PAGE}
          >
            imports
          </a>{" "}
          the transaction JSON file into this web app and review the
          transaction.
        </li>
        <li>
          The Initiator exports transaction as the building packet JSON and
          sends it to signers.
        </li>
        <li>
          Signers{" "}
          <a
            className="text-blue-600 dark:text-blue-500 hover:underline"
            href={IMPORT_PAGE}
          >
            import
          </a>{" "}
          the building packet JSON file into this web app and review the
          transaction.
        </li>
        <li>
          Signers export the transaction for ckb-cli or Neuron depending on
          which tools they are using.
        </li>
        <li>
          Signers send the signed JSON file from ckb-cli or Neuron to the
          Initiator.
        </li>
        <li>
          The Initiator{" "}
          <a
            className="text-blue-600 dark:text-blue-500 hover:underline"
            href={IMPORT_PAGE}
          >
            import
          </a>{" "}
          the received JSON files from Signers to merge signatures.
        </li>
        <li>
          The Initiator sends the transaction when the threshold is reached.
        </li>
      </ol>
    </section>
  );
}

export default function IndexPage({ navigate, state, deleteAddress }) {
  return (
    <>
      <AddressesList
        {...{ navigate, deleteAddress, addresses: state.addresses }}
      />
      <TransactionsList {...{ navigate }} />
    </>
  );
}
