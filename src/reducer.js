import { current } from "immer";
import { useCallback } from "react";
import { useLocalStorage } from "react-use";
import { useImmerReducer } from "use-immer";
import { mergeTransaction } from "./lib/transaction.js";

const LOCAL_STORAGE_KEY = "ckb-multisig";

const INITIAL_STATE = {
  addresses: [],
  transactions: [],
};

function deleteAddressByArgs(draft, args) {
  const index = draft.addresses.findIndex((address) => address.args === args);
  if (index !== -1) {
    return draft.addresses.splice(index, 1)[0];
  }
}

function findTransactionByHash(draft, hash) {
  return draft.transactions.find(
    (tx) => tx.buildingPacket.value.payload.hash === hash,
  );
}

function deleteTransactionByHash(draft, hash) {
  const index = draft.transactions.findIndex(
    (tx) => tx.buildingPacket.value.payload.hash === hash,
  );
  if (index !== -1) {
    return draft.transactions.splice(index, 1)[0];
  }
}

function reducer(draft, action) {
  switch (action.type) {
    case "addAddress":
      const addresses = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      for (const address of addresses) {
        deleteAddressByArgs(draft, address.args);
        draft.addresses.push(address);
      }
      break;
    case "deleteAddress":
      deleteAddressByArgs(draft, action.payload);
      break;
    case "addTransaction":
      const existing = findTransactionByHash(
        draft,
        action.payload.buildingPacket.value.payload.hash,
      );
      if (existing === undefined) {
        draft.transactions.push(action.payload);
      } else {
        mergeTransaction(existing, action.payload);
      }
      break;
    case "deleteTransaction":
      deleteTransactionByHash(draft, action.payload);
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
  const [state, dispatch] = useImmerReducer(reducerLocalStorage, {
    ...INITIAL_STATE,
    ...savedState,
  });
  const addAddress = useCallback(
    (address) => dispatch({ type: "addAddress", payload: address }),
    [dispatch],
  );
  const deleteAddress = useCallback(
    (args) => dispatch({ type: "deleteAddress", payload: args }),
    [dispatch],
  );
  const addTransaction = useCallback(
    (transaction) => dispatch({ type: "addTransaction", payload: transaction }),
    [dispatch],
  );
  const deleteTransaction = useCallback(
    (hash) => dispatch({ type: "deleteTransaction", payload: hash }),
    [dispatch],
  );
  return [
    state,
    { addAddress, deleteAddress, addTransaction, deleteTransaction },
  ];
};

export default usePersistReducer;
