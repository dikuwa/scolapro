import { ShieldCheck } from "lucide-react";
import { ScolaProWordmark } from "@/components/brand/scolapro-brand";
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
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <section className="bg-surface-muted px-4 py-8 sm:px-6 lg:min-h-screen lg:px-8 lg:py-10">
        <div className="mx-auto flex min-h-full w-full max-w-[41rem] flex-col justify-between lg:ml-auto lg:mr-0 lg:min-h-[calc(100vh-5rem)] lg:pr-8">
          <div className="flex min-h-11 items-center">
            <ScolaProWordmark />
          </div>

          <div className="my-12 max-w-2xl lg:my-auto">
            <h1 className="max-w-xl text-[clamp(1.8rem,1.35rem+1.35vw,3rem)] font-semibold leading-[1.12] tracking-[-0.045em] text-foreground">
              School operations that stay connected.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Attendance, teaching, learner records, assessment and statutory reporting built around one dependable source of school data.
            </p>

            <div className="mt-7 flex w-fit items-start gap-3 rounded-[var(--radius-sm)] bg-surface px-4 py-3.5 shadow-[var(--shadow-xs)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-success-soft text-[color:var(--success)]">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">School data stays scoped to authorized users</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Tenant isolation and role permissions are enforced beyond the interface.</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">ScolaPro · Namibia-first education operations</p>
        </div>
      </section>

      <section className="flex min-h-[28rem] items-center px-4 py-10 sm:px-6 lg:min-h-screen lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-[41rem] lg:ml-0 lg:mr-auto lg:pl-8">
          <div className="w-full max-w-md">
            <h2 className="text-[clamp(1.35rem,1.15rem+0.45vw,1.7rem)] font-semibold tracking-[-0.035em]">Welcome back</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Sign in with the account provided by your school or ScolaPro administrator.</p>
            <LoginForm nextPath={nextPath} />
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Having trouble signing in? Contact your school administrator. ScolaPro does not display account-recovery details that could expose school users.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
