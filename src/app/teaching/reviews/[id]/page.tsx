import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getReviewDetail } from "@/features/teaching/server/review-queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { ReviewDetail } from "@/features/teaching/components/review-detail";

interface Props {
  params: { id: string };
}

export default async function ReviewDetailPage({ params }: Props) {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/reviews");
  if (context.platformMemberships.length) redirect("/");

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) redirect("/");

  const detail = await getReviewDetail(params.id);
  if (!detail) notFound();

  return (
    <AppShell>
      <section>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Review Submission</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Submission {params.id.slice(0, 8)}…
            </p>
          </div>
        </div>
        <ReviewDetail data={detail} />
      </section>
    </AppShell>
  );
}
