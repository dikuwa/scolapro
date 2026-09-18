import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ReviewDetail } from "@/features/teaching/components/review-detail";
import { getReviewDetail, resolveReviewScope } from "@/features/teaching/server/review-queries";
import { getUserContext } from "@/lib/auth/get-user-context";

/**
 * Reviewer detail route. A submission that is not visible through the governed
 * RLS read surface (another school, another subject responsibility, stale
 * placement, Platform Support) is answered with the repository not-found
 * convention instead of exposing its existence.
 */
export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");

  const { id } = await params;

  const scope = await resolveReviewScope();
  if (!scope) redirect("/");

  const detail = await getReviewDetail(id);
  if (!detail) notFound();

  return (
    <AppShell>
      <section className="pb-10">
        <Link href="/teaching/reviews" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Preparation review
        </Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Review submission</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {detail.submission.scopeLabel} · {detail.submission.itemCount} {detail.submission.itemCount === 1 ? "preparation" : "preparations"} · academic year {detail.submission.academicYear}
          </p>
        </div>
        <ReviewDetail data={detail} />
      </section>
    </AppShell>
  );
}