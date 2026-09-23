import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CorrespondenceEditor } from "@/features/correspondence/correspondence-editor";
import { getCorrespondenceDocument } from "@/features/correspondence/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const roles = new Set(["school_admin", "principal", "deputy_principal"]);
export const dynamic = "force-dynamic";

export default async function CorrespondenceDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const context = await getUserContext();
  if (!context.user) redirect(`/login?next=/correspondence/${documentId}`);
  const membership = context.memberships.find((candidate) => roles.has(candidate.roleKey));
  if (!membership || context.platformMemberships.length > 0) redirect("/");
  const document = await getCorrespondenceDocument(documentId);
  if (!document || document.schoolId !== membership.schoolId) notFound();
  return <AppShell><div className="space-y-5">
    <div><Link href="/correspondence" className="scolapro-cta inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-brand-strong"><ArrowLeft className="scolapro-cta-icon size-3.5" />Correspondence register</Link><h1 className="scolapro-page-title mt-3">{document.subject || "Official correspondence"}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Revision {document.revisionNumber}{document.revisionReason ? ` · ${document.revisionReason}` : ""}</p></div>
    <CorrespondenceEditor document={document} />
  </div></AppShell>;
}
