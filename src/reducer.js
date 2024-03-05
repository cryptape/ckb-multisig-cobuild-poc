import { current } from "immer";
import { useCallback } from "react";
import { useLocalStorage } from "react-use";
import { useImmerReducer } from "use-immer";
import {
  mergeTransaction,
  resolvePendingSignatures,
} from "./lib/transaction.js";

const LOCAL_STORAGE_KEY = "ckb-multisig";

const INITIAL_STATE = {
  endpoint: "https://testnet.ckbapp.dev/",
  addresses: [],
  transactions: [],
};

export function findAddressByArgs(state, args) {
  return state.addresses.find((address) => address.args === args);
}

function deleteAddressByArgs(draft, args) {
  const index = draft.addresses.findIndex((address) => address.args === args);
  if (index !== -1) {
    return draft.addresses.splice(index, 1)[0];
  }
}

export function findTransactionByHash(state, hash) {
  return state.transactions.find(
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
  let addresses, tx;
  switch (action.type) {
    case "addAddress":
      addresses = Array.isArray(action.payload)
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
      tx = findTransactionByHash(
        draft,
        action.payload.buildingPacket.value.payload.hash,
      );
      if (tx === undefined) {
        draft.transactions.push(action.payload);
      } else {
        mergeTransaction(tx, action.payload);
      }
      break;
    case "deleteTransaction":
      deleteTransactionByHash(draft, action.payload);
      break;
    case "resolveInputs":
      draft.endpoint = action.payload.endpoint;
      tx = findTransactionByHash(draft, action.payload.hash);
      if (tx !== undefined) {
        tx.buildingPacket.value.resolved_inputs = action.payload.resolvedInputs;
        resolvePendingSignatures(tx);
      }
      break;
    case "setTransactionStatus":
      draft.endpoint = action.payload.endpoint;
      tx = findTransactionByHash(draft, action.payload.hash);
      if (tx !== undefined) {
        tx.state = action.payload.status;
      }
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
  const setTransactionStatus = useCallback(
    (endpoint, hash, status) =>
      dispatch({
        type: "setTransactionStatus",
        payload: { endpoint, hash, status },
      }),

    [dispatch],
  );
  const resolveInputs = useCallback(
    (endpoint, hash, resolvedInputs) =>
      dispatch({
        type: "resolveInputs",
        payload: { endpoint, hash, resolvedInputs },
      }),
    [dispatch],
  );
  return [
    state,
    {
      addAddress,
      deleteAddress,
      addTransaction,
      deleteTransaction,
      resolveInputs,
      setTransactionStatus,
    },
  ];
};

export default usePersistReducer;
