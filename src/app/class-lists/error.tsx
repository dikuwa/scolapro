"use client";
export default function ClassListsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]"><h2 className="scolapro-section-title">Class Lists could not load</h2><p className="scolapro-section-description">The roster could not be prepared. Your saved presets remain on this device.</p><button type="button" onClick={reset} className="mt-4 min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white">Try again</button></section>; }

