export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[94rem] animate-pulse">
        <div className="h-7 w-56 rounded-lg bg-surface-subtle" />
        <div className="mt-2 h-4 w-72 max-w-full rounded-md bg-surface-subtle" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 rounded-2xl border border-border/60 bg-surface" />
          ))}
        </div>
        <div className="mt-5 h-96 rounded-2xl border border-border/60 bg-surface" />
      </div>
    </main>
  );
}
