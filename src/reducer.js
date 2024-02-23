import { current } from "immer";
import { useCallback } from "react";
import { useLocalStorage } from "react-use";
import { useImmerReducer } from "use-immer";

const LOCAL_STORAGE_KEY = "ckb-multisig";

const INITIAL_STATE = {
  addresses: [],
};

function reducer(draft, action) {
  switch (action.type) {
    case "addAddress":
      // deduplicate
      const index = draft.addresses.findIndex(
        (config) => config.args === action.payload.args,
      );
      if (index !== -1) {
        draft.addresses.splice(index, 1);
      }
      draft.addresses.push(action.payload);
      break;
    default:
      throw new Error(`Unknown action type ${action.type}`);
  }
}

const usePersistReducer = () => {
  // grab saved value from `localStorage` and
  // a function to update it. if
  // no value is retrieved, use `INITIAL_STATE`
  const [savedState, saveState] = useLocalStorage(
    LOCAL_STORAGE_KEY,
    INITIAL_STATE,
  );

  // wrap `reducer` with a memoized function that
  // syncs the `newState` to `localStorage` before
  // returning `newState`. memoizing is important!
  const reducerLocalStorage = useCallback(
    (draft, action) => {
      reducer(draft, action);
      saveState(current(draft));
    },
    [saveState],
  );

  // use wrapped reducer and the saved value from
  // `localStorage` as params to `useReducer`.
  // this will return `[state, dispatch]`
  return useImmerReducer(reducerLocalStorage, savedState);
};

export default usePersistReducer;
