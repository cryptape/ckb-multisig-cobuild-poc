import { Button } from "flowbite-react";

function AddressesList({ navigate, addresses }) {
  return (
    <section>
      <h2 className="text-lg border-b-2 leading-8 mb-4">Mulgisig Addresses</h2>
      <ul className="mb-4">
        {addresses.map((address) => (
          <li key={`address-#{address.args}`} className="leading-8 font-mono">
            {address.args}
          </li>
        ))}
      </ul>
      <Button onClick={() => navigate("#/addresses/new")}>Add Address</Button>
    </section>
  );
}
export default function IndexPage({ navigate, state }) {
  return (
    <>
      <AddressesList {...{ navigate, addresses: state.addresses }} />
    </>
  );
}
