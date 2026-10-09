import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordRotationForm } from "@/features/auth/password-rotation-form";

export default async function PasswordRotationPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error } = await supabase.from("user_profiles")
    .select("must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Unable to verify your account security status.");
  if (!profile?.must_change_password) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md rounded-[var(--radius-md)] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-semibold">Change your temporary password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your school issued a temporary sign-in password. Choose a new password before accessing your school workspace.</p>
        <PasswordRotationForm />
      </section>
    </main>
  );
}
