export default function Layout({ children, isPending }) {
  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6">
      <section
        style={{
          opacity: isPending ? 0.7 : 1,
        }}
        className="font-serif text-xl leading-8"
      >
        CKB Multisig CoBuild PoC
      </section>
      <main>{children}</main>
    </div>
  );
}
