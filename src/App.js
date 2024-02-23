import { Suspense, useTransition } from "react";
import { useHash } from "react-use";
import IndexPage from "./IndexPage.js";
import Layout from "./Layout.js";
import { Spinner } from "flowbite-react";

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

  function navigate(url) {
    startTransition(() => {
      setPage(url);
    });
  }

  let content;
  if (page === "" || page === "#/") {
    content = <IndexPage />;
  } else {
    content = <NotFound page={page} navigate={navigate} />;
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
