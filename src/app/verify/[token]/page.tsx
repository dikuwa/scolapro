import type { Metadata } from "next";
import { BadgeCheck, GraduationCap, History, ShieldX } from "lucide-react";
import { getPublicOfficialDocumentVerification } from "@/features/documents/server/public-document-verification";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify an official document · ScolaPro",
  description: "Confirm the minimal provenance of a finalized ScolaPro official document.",
  robots: { index: false, follow: false },
};

function formatIssueDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-NA", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export default async function OfficialDocumentVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verification = await getPublicOfficialDocumentVerification(token);

  if (!verification) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <section className="scolapro-public-width flex min-h-[70vh] items-center justify-center">
          <div className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface p-6 text-center shadow-[var(--shadow-xs)] sm:p-8">
            <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-danger-soft text-[color:var(--danger)]">
              <ShieldX className="size-5" aria-hidden="true" />
            </span>
            <h1 className="scolapro-page-title mt-4 text-xl">Verification unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This verification link is invalid or unavailable. Check the printed QR code or ask the issuing school to confirm the reference.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const superseded = verification.validityStatus === "superseded";
  const revoked = verification.validityStatus === "revoked";
  const StatusIcon = revoked ? ShieldX : superseded ? History : BadgeCheck;
  const statusLabel = revoked ? "Revoked" : superseded ? "Superseded revision" : "Valid finalized record";
  const statusClasses = revoked
    ? "bg-danger-soft text-[color:var(--danger)]"
    : superseded
      ? "bg-warning-soft text-[color:var(--warning)]"
      : "bg-success-soft text-[color:var(--success)]";

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <section className="scolapro-public-width mx-auto">
        <header className="flex items-center gap-3 text-sm font-semibold">
          <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-brand text-white shadow-[var(--shadow-xs)]">
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
          ScolaPro document verification
        </header>

        <div className="mx-auto mt-10 max-w-2xl rounded-[var(--radius-md)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-xs)] sm:p-8">
          <div className={`inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium ${statusClasses}`}>
            <StatusIcon className="size-4" aria-hidden="true" />
            {statusLabel}
          </div>

          <h1 className="scolapro-page-title mt-5 text-[clamp(1.45rem,1.2rem+0.8vw,2rem)]">
            {verification.documentType}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Issued by {verification.schoolName}</p>

          {superseded ? (
            <p className="mt-5 rounded-[var(--radius-sm)] bg-warning-soft px-4 py-3 text-sm leading-6 text-[color:var(--warning)]">
              This finalized revision remains authentic, but a newer revision has superseded it.
            </p>
          ) : null}
          {revoked ? (
            <p className="mt-5 rounded-[var(--radius-sm)] bg-danger-soft px-4 py-3 text-sm leading-6 text-[color:var(--danger)]">
              This reference matches a finalized record that has since been revoked. Do not treat this revision as currently valid.
            </p>
          ) : null}

          <dl className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
            <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-sm text-muted-foreground">ScolaPro reference</dt>
              <dd className="break-all text-sm font-semibold">{verification.scolaproReference}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-sm text-muted-foreground">Issue date</dt>
              <dd className="text-sm font-medium">{formatIssueDate(verification.issuedOn)}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-sm text-muted-foreground">Revision</dt>
              <dd className="text-sm font-medium">{verification.revision}</dd>
            </div>
          </dl>

          <p className="mt-5 text-sm leading-6 text-muted-foreground">{verification.confirmation}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Verification confirms provenance only. This page does not display the document or any confidential record data.
          </p>
        </div>
      </section>
    </main>
  );
}
