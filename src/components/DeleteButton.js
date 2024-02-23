import { Button } from "flowbite-react";
import { useState } from "react";
import { HiOutlineTrash, HiOutlineX } from "react-icons/hi";

export default function DeleteButton({ onClick, ...props }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        {...props}
        onClick={() => setConfirming(true)}
        outline
        color="failure"
        className="bg-slate-300"
      >
        <HiOutlineTrash className="w-5 h-5 mr-2" /> Delete
      </Button>
    );
  } else {
    return (
      <Button.Group outline>
        <Button {...props} onClick={onClick} color="failure">
          <HiOutlineTrash className="h-5 w-5 mr-2" />
          Confirm
        </Button>
        <Button onClick={() => setConfirming(false)} color="gray">
          <HiOutlineX className="h-5 w-5" />
        </Button>
      </Button.Group>
    );
  }
}
