import { GraduationCap, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(24rem,34rem)] lg:gap-8 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col justify-between rounded-[1.5rem] bg-surface-muted p-6 sm:p-8 lg:mx-0 lg:min-h-[calc(100vh-4rem)] lg:p-10">
        <div className="flex items-center gap-3 text-sm font-semibold tracking-[-0.02em]">
          <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-[var(--shadow-sm)]">
            <GraduationCap aria-hidden="true" className="size-5" />
          </span>
          ScolaPro
        </div>

        <div className="my-12 max-w-2xl lg:my-auto">
          <h1 className="max-w-xl text-[clamp(1.8rem,1.35rem+1.35vw,3rem)] font-semibold leading-[1.12] tracking-[-0.045em] text-foreground">
            School operations that stay connected.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            Attendance, teaching, learner records, assessment and statutory reporting built around one dependable source of school data.
          </p>

          <div className="mt-7 flex w-fit items-start gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-[var(--shadow-sm)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-[color:var(--success)]">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">School data stays scoped to authorized users</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Tenant isolation and role permissions are enforced beyond the interface.</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">ScolaPro · Namibia-first education operations</p>
      </section>

      <section className="mx-auto flex w-full max-w-md items-center py-10 lg:max-w-none lg:py-0">
        <div className="w-full lg:px-8">
          <h2 className="text-[clamp(1.35rem,1.15rem+0.45vw,1.7rem)] font-semibold tracking-[-0.035em]">Welcome back</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Sign in with the account provided by your school or ScolaPro administrator.</p>
          <LoginForm nextPath={nextPath} />
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Having trouble signing in? Contact your school administrator. ScolaPro does not display account-recovery details that could expose school users.
          </p>
        </div>
      </section>
    </main>
  );
}
