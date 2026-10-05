import Link from "next/link";
import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { OfficialDocumentPreview } from "@/components/documents/official-document-preview";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export default async function BlankAdmissionApplicationPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.currentSchoolMembership;
  if (!membership || !managerRoles.has(membership.roleKey)) redirect("/");

  const academicYear = getNamibiaCalendarYear();
  const pdfHref = `/api/official-documents/admission-application?year=${academicYear}&format=pdf`;
  const pdfPreviewHref = `${pdfHref}&preview=1`;

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/school/admissions" className="text-xs font-semibold text-muted-foreground transition hover:text-foreground">
              ← Admissions
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <span className="scolapro-tone-brand grid size-9 place-items-center rounded-[var(--radius-sm)]">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h1 className="scolapro-page-title text-xl">Learner Application Form</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Official blank admission form for {membership.schoolName} · {academicYear}. Preview, print or download the same canonical PDF.
                </p>
              </div>
            </div>
          </div>
          <OfficialDocumentActions
            previewHref="#application-form-preview"
            downloadHref={pdfHref}
            downloadLabel="PDF"
          />
        </div>

        <section id="application-form-preview" className="scroll-mt-4 overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold">Application form preview</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Official external-document header · Coat of Arms · school details · school logo.
              </p>
            </div>
            <span className="self-start rounded-[var(--radius-xs)] bg-brand-soft px-2.5 py-1 text-[0.68rem] font-semibold text-brand-strong sm:self-auto">
              A4 · 1 page
            </span>
          </div>
          <OfficialDocumentPreview
            src={pdfPreviewHref}
            title="Learner application form PDF preview"
            orientation="portrait"
            fit="viewport"
            helper="The canonical A4 PDF is shown here in the application workspace. Use PDF above only when you need the downloaded file."
          />
        </section>
      </div>
    </AppShell>
  );
}
