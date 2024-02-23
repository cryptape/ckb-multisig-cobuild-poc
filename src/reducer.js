import { enableMapSet } from "immer";
import { useCallback, useReducer } from "react";
import { useLocalStorage } from "react-use";
import { useImmerReducer } from "use-immer";

enableMapSet();

const LOCAL_STORAGE_KEY = "ckb-multisig";

const INITIAL_STATE = {
  addresses: [],
};

const reducer = (state, action) => {
  // return updated state based on `action.type`
};

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
    (state, action) => {
      const newState = reducer(state, action);

      saveState(newState);

      return newState;
    },
    [saveState],
  );

  // use wrapped reducer and the saved value from
  // `localStorage` as params to `useReducer`.
  // this will return `[state, dispatch]`
  return useReducer(reducerLocalStorage, savedState);
};

const Example = () => {
  // return value from `usePersistReducer` is identical
  // to `useReducer`
  const [state, dispatch] = usePersistReducer();

  // render UI based on `state`
  // call `dispatch` based on user actions
};
