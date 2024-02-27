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

function TransactionsList({ navigate }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg border-b-2 mb-4">Transactions</h2>
      <div className="mb-4 flex flex-row gap-2 flex-wrap">
        <Button onClick={() => navigate("#/transactions/import")}>
          Import Transaction
        </Button>
      </div>
      <p className="text-sm">
        Importing will automatically merge collected signatures for the same
        transaction.
      </p>
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
