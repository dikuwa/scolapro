import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ProfileSettings } from "@/features/profile/profile-settings";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/settings");

  let avatarUrl: string | null = null;
  if (context.avatarPath) {
    const supabase = await createSupabaseServerClient();
    avatarUrl = supabase.storage.from("avatars").getPublicUrl(context.avatarPath).data.publicUrl;
  }

  return (
    <AppShell>
      <section>
        <div className="mb-6">
          <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">Account settings</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Manage your personal ScolaPro account appearance and sign-in security. School roles and permissions remain governed separately.</p>
        </div>
        <ProfileSettings avatarUrl={avatarUrl} userId={context.user.id} mustChangePassword={context.mustChangePassword} />
      </section>
    </AppShell>
  );
}
