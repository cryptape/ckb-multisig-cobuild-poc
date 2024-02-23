import { Suspense, useCallback, useTransition } from "react";
import { useHash } from "react-use";
import IndexPage from "./IndexPage.js";
import NewAddressPage from "./NewAddressPage.js";
import Layout from "./Layout.js";
import { Spinner } from "flowbite-react";
import usePersistReducer from "./reducer.js";

function App() {
  return (
    <Suspense fallback={<BigSpinner />}>
      <Router />
    </Suspense>
  );
}

function Router() {
  const [page, setPage] = useHash();
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = usePersistReducer();

  const navigate = useCallback((url) => startTransition(() => setPage(url)));
  const addAddress = useCallback((payload) =>
    dispatch({ type: "addAddress", payload }),
  );

  let content;
  switch (page) {
    case "":
    case "#/":
      content = <IndexPage {...{ navigate, state }} />;
      break;
    case "#/addresses/new":
      content = <NewAddressPage {...{ navigate, addAddress }} />;
      break;
    default:
      content = <NotFound {...{ page, navigate }} />;
      break;
  }

  return <Layout isPending={isPending}>{content}</Layout>;
}

function BigSpinner() {
  return (
    <div className="leading-6 text-center">
      <Spinner /> Loading...
    </div>
  );
}

function NotFound({ navigate, page }) {
  return (
    <>
      <h2>Page Not Found: {page}</h2>
      <a onClick={() => navigate("#/")} href="#/">
        Go to the home page
      </a>
    </>
  );
}

export default App;
