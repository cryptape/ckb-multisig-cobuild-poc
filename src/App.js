import { Spinner } from "flowbite-react";
import { Suspense, useTransition } from "react";
import { useHash } from "react-use";
import AddressPage from "./AddressPage.js";
import ImportAddressPage from "./ImportAddressPage.js";
import ImportTransactionPage from "./ImportTransactionPage.js";
import IndexPage from "./IndexPage.js";
import Layout from "./Layout.js";
import NewAddressPage from "./NewAddressPage.js";
import usePersistReducer from "./reducer.js";

function App() {
  return (
    <Suspense fallback={<BigSpinner />}>
      <Router />
    </Suspense>
  );
}

function findAddress(state, args) {
  return state.addresses.find((address) => address.args === args);
}

function Router() {
  const [page, setPage] = useHash();
  const [isPending, startTransition] = useTransition();
  const [state, { addAddress, deleteAddress, addTransaction }] =
    usePersistReducer();

  const navigate = (url) => startTransition(() => setPage(url));

  const fallbackRoute = () => <NotFound {...{ page, navigate }} />;
  const staticRoutes = {
    "#/": () => <IndexPage {...{ navigate, state, deleteAddress }} />,
    "#/addresses/new": () => <NewAddressPage {...{ navigate, addAddress }} />,
    "#/addresses/import": () => (
      <ImportAddressPage {...{ navigate, addAddress }} />
    ),
    "#/transactions/import": () => (
      <ImportTransactionPage {...{ navigate, addTransaction }} />
    ),
  };
  staticRoutes[""] = staticRoutes["#/"];
  const dynamicRoutes = [
    [
      "#/addresses/duplicate/",
      (args) => (
        <NewAddressPage
          {...{ navigate, addAddress, template: findAddress(state, args) }}
        />
      ),
    ],
    [
      "#/addresses/",
      (args) => {
        const address = findAddress(state, args);
        return address ? (
          <AddressPage {...{ address, deleteAddress, navigate }} />
        ) : (
          fallbackRoute()
        );
      },
    ],
  ];
  const content = dispatchRoute(
    page,
    staticRoutes,
    dynamicRoutes,
    fallbackRoute,
  );

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

function dispatchRoute(page, staticRoutes, dynamicRoutes, fallbackRoute) {
  if (page in staticRoutes) {
    return staticRoutes[page]();
  }
  for (const [prefix, creator] of dynamicRoutes) {
    if (page.startsWith(prefix)) {
      const path = page.slice(prefix.length).split("/");
      return creator(...path);
    }
  }
  return fallbackRoute();
}

export default App;
