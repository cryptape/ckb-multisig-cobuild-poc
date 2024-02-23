import { Button } from "flowbite-react";
import DeleteButton from "./components/DeleteButton.js";

function AddressesList({ navigate, addresses, deleteAddress }) {
  return (
    <section>
      <h2 className="text-lg border-b-2 mb-4">Mulgisig Addresses</h2>
      <ul className="mb-4">
        {addresses.map((address) => (
          <li
            key={`address-#{address.args}`}
            className="font-mono flex flex-row gap-2 items-center p-2 hover:bg-slate-100"
          >
            <a className="grow break-all" href={`#/addresses/${address.args}`}>
              {address.args}
            </a>
            <DeleteButton onClick={() => deleteAddress(address.args)} />
          </li>
        ))}
      </ul>
      <Button onClick={() => navigate("#/addresses/new")}>Add Address</Button>
    </section>
  );
}
export default function IndexPage({ navigate, state, deleteAddress }) {
  return (
    <>
      <AddressesList
        {...{ navigate, deleteAddress, addresses: state.addresses }}
      />
    </>
  );
}
