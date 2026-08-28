import Link from "next/link";
import { ArrowLeft, Database, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { LearnerRegistrationForm } from "@/features/learners/registration-form";
import { getRegistrationOptions } from "@/features/learners/server/registration-options";
import { getUserContext } from "@/lib/auth/get-user-context";
import { isSupabaseConfigured } from "@/lib/config/runtime";

export default async function RegisterLearnerPage() {
  if (!isSupabaseConfigured()) return <AppShell><SetupRequired /></AppShell>;
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships.find((item) => item.roleKey === "school_admin");

  if (!membership) {
    return <AppShell><section className="mx-auto max-w-2xl"><Link href="/learners" className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Learners</Link><div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)]"><span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-warning-soft text-[color:var(--warning)]"><ShieldAlert className="size-5" /></span><h1 className="mt-4 scolapro-page-title text-xl">Registration access is restricted</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Only an authorized school administrator can register a learner into the school.</p></div></section></AppShell>;
  }

  const academicYear = new Date().getFullYear();
  const grades = await getRegistrationOptions(membership.schoolId, academicYear);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl">
        <Link href="/learners" className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Learners</Link>
        <div className="mb-5"><h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Register learner</h1><p className="mt-1 text-sm text-muted-foreground">{membership.schoolName} · Academic year {academicYear}</p></div>
        <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-sm)] sm:p-6">
          {grades.length ? <LearnerRegistrationForm schoolId={membership.schoolId} academicYear={academicYear} grades={grades} defaultAdmissionDate={today} /> : <div className="rounded-[var(--radius-sm)] bg-warning-soft px-4 py-4 text-sm text-[color:var(--warning)]">Configure grades and register classes for {academicYear} before registering learners.</div>}
        </div>
      </section>
    </AppShell>
  );
}

function SetupRequired() {
  return <section className="mx-auto max-w-2xl"><Link href="/learners" className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Learners</Link><div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)]"><span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-info-soft text-[color:var(--info)]"><Database className="size-5" /></span><h1 className="mt-4 scolapro-page-title text-xl">Database connection is not configured yet</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Learner registration opens after the ScolaPro Supabase environment is connected.</p></div></section>;
}
