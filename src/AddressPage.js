import DeleteButton from "./components/DeleteButton.js";
import { Button } from "flowbite-react";

export default function AddressPage({ address, deleteAddress, navigate }) {
  return (
    <section>
      <h2 className="text-lg mb-4">
        Multisig <code className="break-all">{address.args}</code>
      </h2>
      <p className="mb-4">
        Requiring {address.threshold}{" "}
        {address.threshold === 1 ? "signature" : "signatures"} from{" "}
        {address.signers.length}{" "}
        {address.signers.length === 1 ? "signer" : "signers"}:
      </p>

      <ol className="mb-4 list-decimal list-outside ml-4">
        {address.signers.map((signer, i) => (
          <li key={`signer-${i}`} className="leading-6 break-all">
            <code>{signer}</code>
          </li>
        ))}
      </ol>

      {address.required > 0 ? (
        <p className="mb-4">
          Signatures from the first {address.required}{" "}
          {address.required === 1 ? "signer" : "signers"} are required.
        </p>
      ) : null}

      <div className="flex flex-row gap-2 flex-wrap">
        <Button as="a" href={`#/addresses/duplicate/${address.args}`}>
          Duplicate
        </Button>
        <DeleteButton
          onClick={() => {
            deleteAddress(address.args);
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
