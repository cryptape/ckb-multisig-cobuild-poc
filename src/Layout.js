export default function Layout({ children, isPending }) {
  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6">
      <div>
        <header
          style={{
            opacity: isPending ? 0.7 : 1,
          }}
          className="font-serif text-xl leading-8 mb-8"
        >
          <a href="#/">CKB Multisig CoBuild PoC</a>
        </header>
        <main className="box-border">{children}</main>
      </div>
    </div>
  );
}
