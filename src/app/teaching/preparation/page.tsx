import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
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
        <Link href="/teaching" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Teaching</Link>
        <div className="mb-6"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Lesson preparation</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Prepare from your connected pacing plan and scheduled lessons. Curriculum registry values remain controlled; teacher preparation, HOD submission and retrospective actual teaching stay separate.</p></div>
        <LessonPreparationWorkspace data={data} />
      </section>
    </AppShell>
  );
}
