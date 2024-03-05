import { Alert, Button, Label, TextInput } from "flowbite-react";
import { useEffect } from "react";
import { HiMinus, HiPlus } from "react-icons/hi";
import { useImmerReducer } from "use-immer";
import { MultisigConfig } from "./schemas.js";

function hasNoError(error, name) {
  return error === null || error[name] === undefined;
}

function fieldColor(error, name) {
  return hasNoError(error, name) ? "gray" : "failure";
}

function fieldHelperText(error, name, defaultText) {
  return hasNoError(error, name) ? defaultText : error[name].message;
}

function check(draft, formData) {
  const input = {
    args: "",
    threshold: formData.get("threshold"),
    required: formData.get("required"),
    signers: new Array(draft.data.signers.length),
  };
  for (let i = 0; i < input.signers.length; ++i) {
    input.signers[i] = formData.get(`signers.${i}`);
  }
  const result = MultisigConfig.safeParse(input);
  if (result.success) {
    draft.done = true;
    draft.error = null;
    draft.data = result.data;
  } else {
    draft.error = {};
    for (const issue of result.error.issues) {
      draft.error[issue.path.join(".")] = issue;
    }
  }
}

export default function NewAddressPage({ addAddress, navigate, template }) {
  const [state, dispatch] = useImmerReducer(
    (draft, action) => {
      let data;
      switch (action.type) {
        case "incrementSigner":
          draft.data.signers.push("");
          break;
        case "decrementSigner":
          draft.data.signers.pop();
          if (draft.data.signers.length === 0) {
            draft.data.signers.push("");
          }
          break;
        case "submit":
          data = check(draft, action.payload);
          if (data !== undefined) {
            addAddress(data);
          }
          break;
        default:
          throw new Error(`unknown action type ${action.type}`);
      }
    },
    {
      error: null,
      data: template ?? {
        args: "",
        threshold: 1,
        required: 0,
        signers: [""],
      },
    },
  );
  const incrementSigner = () => dispatch({ type: "incrementSigner" });
  const decrementSigner = () => dispatch({ type: "decrementSigner" });
  const submit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    dispatch({ type: "submit", payload: formData });
  };

  useEffect(() => {
    if (state.done) {
      addAddress(state.data);
      navigate("#/");
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg">Add Multisig Address</h2>
      <div className="flex flex-row gap-4">
        <div className="w-1/2">
          <div className="mb-2 block">
            <Label htmlFor="threshold" value="Threshold (M)" />
          </div>
          <TextInput
            id="threshold"
            name="threshold"
            type="number"
            min="1"
            max={state.data.signers.length}
            defaultValue={state.data.threshold}
            required
            sizing="md"
            color={fieldColor(state.error, "threshold")}
            helperText={fieldHelperText(
              state.error,
              "threshold",
              `Requires signatures from any M of ${state.data.signers.length} signers`,
            )}
          />
        </div>
        <div className="w-1/2">
          <div className="mb-2 block">
            <Label htmlFor="required" value="Required (R)" />
          </div>
          <TextInput
            id="required"
            name="required"
            type="number"
            min="0"
            max={state.data.signers.length}
            defaultValue={state.data.required}
            required
            sizing="md"
            color={fieldColor(state.error, "required")}
            helperText={fieldHelperText(
              state.error,
              "required",
              "Requires signatures from first R signers",
            )}
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend>Signers</legend>

        {hasNoError(state.error, "signers") ? null : (
          <Alert color="failure">{state.error.signers.message}</Alert>
        )}

        {state.data.signers.map((signer, index) => (
          <div key={`signer-${index}`}>
            <TextInput
              id={`signer-${index}`}
              name={`signers.${index}`}
              type="text"
              sizing="md"
              defaultValue={signer}
              color={fieldColor(state.error, `signers.${index}`)}
              helperText={fieldHelperText(state.error, `signers.${index}`)}
            />
          </div>
        ))}
        <div className="text-right">
          <Button
            className="inline-block"
            color="red"
            outline
            onClick={decrementSigner}
            disabled={state.data.signers.length <= 1}
          >
            <HiMinus className="h-5 w-5" />
          </Button>
          <Button
            className="inline-block"
            color="green"
            outline
            onClick={incrementSigner}
          >
            <HiPlus className="h-5 w-5" />
          </Button>
        </div>
      </fieldset>

      <Button type="submit">Save</Button>
    </form>
  );
}
