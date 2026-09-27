"use client";

import Link from "next/link";
import type { LearnerConductProfile } from "./server/profile";

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function LearnerConductProfileView({
  learnerId,
  learnerName,
  classLabel,
  profile,
  page,
}: {
  learnerId: string;
  learnerName: string;
  classLabel: string;
  profile: LearnerConductProfile;
  page: number;
}) {
  const recognition = profile.breakdown.filter((row) => row.type === "recognition");
  const violations = profile.breakdown.filter((row) => row.type === "violation");

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-5">
        <div className="px-4 py-4 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Recognitions</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{profile.summary.recognition_count}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Violations</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-amber)]">{profile.summary.violation_count}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 xl:border-l xl:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Recognition points</p><p className="mt-1.5 text-2xl font-semibold">{signed(profile.summary.recognition_points)}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 sm:border-l sm:px-5 xl:border-t-0"><p className="text-xs font-medium text-muted-foreground">Violation points</p><p className="mt-1.5 text-2xl font-semibold">{signed(profile.summary.violation_points)}</p></div>
        <div className="border-t border-border-subtle px-4 py-4 xl:border-l xl:border-t-0 sm:px-5"><p className="text-xs font-medium text-muted-foreground">Net points</p><p className="mt-1.5 text-2xl font-semibold">{signed(profile.summary.net_points)}</p></div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div>
          <h2 className="scolapro-section-title">Term comparison</h2>
          <p className="scolapro-section-description">{profile.academicYear} · governed school term dates only.</p>
        </div>
        {profile.terms.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {profile.terms.map((term) => (
              <article key={term.term_number} className="rounded-[var(--radius-sm)] bg-surface-muted p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="scolapro-record-title">{term.display_name}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">{signed(term.net_points)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><dt className="text-muted-foreground">Recognitions</dt><dd className="mt-1 font-semibold">{term.recognition_count}</dd></div>
                  <div><dt className="text-muted-foreground">Violations</dt><dd className="mt-1 font-semibold">{term.violation_count}</dd></div>
                  <div><dt className="text-muted-foreground">Recognition points</dt><dd className="mt-1 font-semibold">{signed(term.recognition_points)}</dd></div>
                  <div><dt className="text-muted-foreground">Violation points</dt><dd className="mt-1 font-semibold">{signed(term.violation_points)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-5 text-sm text-muted-foreground">No governed academic terms are configured for this academic year.</p>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="scolapro-section-title">Recognition breakdown</h2>
          <div className="mt-3 divide-y divide-border-subtle">
            {recognition.length ? recognition.map((row) => (
              <div key={row.group_name} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{row.group_name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{row.event_count} · {signed(row.points)}</span>
              </div>
            )) : <p className="py-4 text-sm text-muted-foreground">No Recognition recorded in this academic year.</p>}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="scolapro-section-title">Violation breakdown</h2>
          <div className="mt-3 divide-y divide-border-subtle">
            {violations.length ? violations.map((row) => (
              <div key={row.group_name} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{row.group_name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{row.event_count} · {signed(row.points)}</span>
              </div>
            )) : <p className="py-4 text-sm text-muted-foreground">No Violations recorded in this academic year.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="scolapro-section-title">Conduct timeline</h2>
            <p className="scolapro-section-description">{learnerName} · {classLabel} · individual auditable records.</p>
          </div>
          <Link href={`/conduct?learner=${learnerId}`} className="scolapro-cta text-sm font-medium text-brand-strong">Record / full Conduct workspace</Link>
        </div>

        {profile.timeline.length ? (
          <div className="mt-4 divide-y divide-border-subtle">
            {profile.timeline.map((event) => (
              <article key={event.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="scolapro-record-title">{event.item_name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{event.type === "recognition" ? "Recognition" : "Violation"} · {event.group_name} · {signed(event.points)}{event.severity && event.type === "violation" ? ` · ${event.severity}` : ""}</p>
                  </div>
                  <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{event.event_date}</time>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Recorded by {event.recorded_by}</p>
                {event.note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{event.note}</p> : null}
              </article>
            ))}
          </div>
        ) : <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-center"><p className="text-sm font-medium">No conduct history</p><p className="mt-1 text-xs text-muted-foreground">No Recognition or Violations were recorded for this academic year.</p></div>}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <div className="flex gap-2">
            <Link
              aria-disabled={page === 0}
              tabIndex={page === 0 ? -1 : undefined}
              href={page === 0 ? "#" : `?page=${page - 1}`}
              className={`inline-flex min-h-9 items-center justify-center rounded-[var(--radius-sm)] border border-border-subtle px-3 text-sm font-medium ${page === 0 ? "pointer-events-none opacity-50" : "hover:bg-surface-muted"}`}
            >
              Previous
            </Link>
            <Link
              aria-disabled={!profile.hasMore}
              tabIndex={!profile.hasMore ? -1 : undefined}
              href={!profile.hasMore ? "#" : `?page=${page + 1}`}
              className={`inline-flex min-h-9 items-center justify-center rounded-[var(--radius-sm)] border border-border-subtle px-3 text-sm font-medium ${!profile.hasMore ? "pointer-events-none opacity-50" : "hover:bg-surface-muted"}`}
            >
              Next
            </Link>
          </div>
        </div>
      </section>

      <p className="text-xs leading-5 text-muted-foreground">Counts and points are shown separately. ScolaPro does not classify learners as good, bad or poor conduct from a score.</p>
    </div>
  );
}
