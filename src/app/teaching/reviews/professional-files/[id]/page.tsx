import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProfessionalFileReviewDetail } from "@/features/teaching/components/professional-file-review-detail";
import { getProfessionalFileReviewDetail } from "@/features/teaching/server/professional-file-review";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function ProfessionalFileReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");
  const { id } = await params;
  const detail = await getProfessionalFileReviewDetail(id);
  if (!detail) notFound();

  return (
    <AppShell>
      <section className="pb-10">
        <Link href="/teaching/reviews" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Teaching reviews
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title">Professional-file review</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review only the teacher-selected document within your current subject responsibility.
          </p>
        </div>
        <ProfessionalFileReviewDetail data={detail} />
      </section>
    </AppShell>
  );
}
