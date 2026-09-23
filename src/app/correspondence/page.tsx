import Link from "next/link";
import { FileText, PenLine, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { NewCorrespondenceButton } from "@/features/correspondence/new-correspondence-button";
import { getCorrespondenceDocuments } from "@/features/correspondence/server/queries";
import { CORRESPONDENCE_TEMPLATES } from "@/features/correspondence/templates";
import { getUserContext } from "@/lib/auth/get-user-context";

const roles = new Set(["school_admin", "principal", "deputy_principal"]);
export const dynamic = "force-dynamic";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

export default async function CorrespondencePage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/correspondence");
  const membership = context.memberships.find((candidate) => roles.has(candidate.roleKey));
  if (!membership || context.platformMemberships.length > 0) redirect("/");
  const documents = await getCorrespondenceDocuments(membership.schoolId);
  const drafts = documents.filter((document) => document.status === "draft").length;
  const finalized = documents.length - drafts;

  return <AppShell><div className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="scolapro-page-title">School correspondence</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Create governed official letters using {membership.schoolName}&apos;s external correspondence header. Finalized records are frozen and corrections require a revision.</p></div><NewCorrespondenceButton /></div>
    <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-3">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Documents</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-indigo)]">{documents.length}</p></div><span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]"><FileText className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Drafts</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-amber)]">{drafts}</p></div><span className="scolapro-tone-amber grid size-9 place-items-center rounded-[var(--radius-sm)]"><PenLine className="size-4" /></span></div>
      <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5"><div><p className="text-xs font-medium text-muted-foreground">Finalized</p><p className="mt-1.5 text-2xl font-semibold text-[color:var(--accent-mint)]">{finalized}</p></div><span className="scolapro-tone-mint grid size-9 place-items-center rounded-[var(--radius-sm)]"><ShieldCheck className="size-4" /></span></div>
    </div>
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="border-b border-border-subtle pb-4"><h2 className="scolapro-section-title">Correspondence register</h2><p className="scolapro-section-description">Drafts and immutable finalized revisions for the current school.</p></div>
      {documents.length ? <div className="divide-y divide-border-subtle">{documents.map((document) => {
        const template = CORRESPONDENCE_TEMPLATES.find((item) => item.key === document.templateKey)?.label ?? "Official correspondence";
        return <Link key={document.id} href={`/correspondence/${document.id}`} className="scolapro-cta grid gap-2 py-4 transition hover:bg-surface-muted/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="scolapro-record-title truncate">{document.subject || template}</p><span className={`rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.68rem] font-medium ${document.status === "finalized" ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{document.status === "finalized" ? "Finalized" : "Draft"}</span></div><p className="mt-1 text-xs text-muted-foreground">{template} · To: {document.recipient || "Not entered"} · Revision {document.revisionNumber}</p></div><div className="text-left text-xs text-muted-foreground sm:text-right"><p>{dateLabel(document.documentDate)}</p><p className="mt-1">{document.referenceNumber ?? "No reference yet"}</p></div></Link>;
      })}</div> : <div className="py-12 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><FileText className="size-5" /></span><h3 className="mt-3 text-sm font-semibold">No correspondence yet</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Create the first governed letter, notice, invitation, vacancy or memo for this school.</p></div>}
    </section>
  </div></AppShell>;
}
