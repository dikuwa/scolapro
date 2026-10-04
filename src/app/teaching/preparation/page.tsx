import { redirect } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { LessonPreparationWorkspace } from "@/features/academics/lesson-preparation-workspace";
import { getLessonPreparationWorkspace } from "@/features/academics/server/lesson-preparation";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function LessonPreparationPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/teaching/preparation");
  if (context.platformMemberships.length) redirect("/");
  if (!context.memberships.some((item) => ["teacher", "class_teacher"].includes(item.roleKey))) redirect("/teaching");
  const data = await getLessonPreparationWorkspace();
  if (!data) redirect("/teaching");
  return (
    <AppShell>
      <section className="pb-10">
        <AppBackLink href="/teaching" label="Teaching" className="mb-4" />
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Lesson preparation</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Prepare from your connected pacing plan and scheduled lessons. Curriculum registry values remain controlled; teacher preparation, HOD submission and retrospective actual teaching stay separate.</p></div>
        <LessonPreparationWorkspace data={data} offlineScope={{ userId: context.user.id, tenantId: context.currentSchoolMembership?.tenantId ?? "", schoolId: data.schoolId }} />
      </section>
    </AppShell>
  );
}
