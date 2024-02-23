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

const PREFIX_DUPLICATE_ADDRESS = "#/addresses/duplicate/";

function Router() {
  const [page, setPage] = useHash();
  const [isPending, startTransition] = useTransition();
  const [state, { addAddress, deleteAddress }] = usePersistReducer();

  const navigate = useCallback((url) => startTransition(() => setPage(url)));

  let content;
  switch (page) {
    case "":
    case "#/":
      content = <IndexPage {...{ navigate, state, deleteAddress }} />;
      break;
    case "#/addresses/new":
      content = <NewAddressPage {...{ navigate, addAddress }} />;
      break;
    default:
      if (page.startsWith(PREFIX_DUPLICATE_ADDRESS)) {
        content = (
          <NewAddressPage
            {...{
              navigate,
              addAddress,
              template: page.substring(PREFIX_DUPLICATE_ADDRESS.length),
            }}
          />
        );
      } else {
        content = <NotFound {...{ page, navigate }} />;
      }
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
