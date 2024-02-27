export default function ImportTransactionPage() {
  const submit = () => {
    console.log("submit");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg mb-4">Import Transaction</h2>
    </form>
  );
}
