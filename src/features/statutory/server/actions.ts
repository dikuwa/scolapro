"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function statutoryRedirect(kind: "success" | "error", message: string): never {
  const params = new URLSearchParams({ [kind]: message });
  redirect(`/statutory?${params.toString()}`);
}

export async function compileStatutorySnapshotAction(formData: FormData) {
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!snapshotId) statutoryRedirect("error", "A statutory snapshot is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("compile_statutory_mapping", { p_snapshot_id: snapshotId });
  if (error) statutoryRedirect("error", error.message || "Unable to compile statutory readiness.");

  revalidatePath("/statutory");
  statutoryRedirect("success", "Statutory readiness was refreshed from the immutable snapshot.");
}

export async function certifyStatutorySnapshotAction(formData: FormData) {
  const snapshotId = String(formData.get("snapshotId") ?? "");
  const statement = String(formData.get("statement") ?? "").trim();
  if (!snapshotId) statutoryRedirect("error", "A statutory snapshot is required.");

  const context = await getUserContext();
  if (!context.user) redirect("/login?next=/statutory");

  const supabase = await createSupabaseServerClient();
  const { data: snapshot, error: snapshotError } = await supabase
    .from("statutory_snapshots")
    .select("school_id")
    .eq("id", snapshotId)
    .maybeSingle();

  if (snapshotError || !snapshot) statutoryRedirect("error", "The statutory snapshot is unavailable in your scope.");

  const certifier = context.memberships.find(
    (membership) => membership.schoolId === snapshot.school_id && ["principal", "school_admin"].includes(membership.roleKey),
  );
  if (!certifier) statutoryRedirect("error", "Only the school principal or school administrator may certify this snapshot.");

  const { error } = await supabase.rpc("certify_statutory_snapshot", {
    p_snapshot_id: snapshotId,
    p_certification_role: certifier.roleKey,
    p_statement: statement || null,
  });
  if (error) statutoryRedirect("error", error.message || "Unable to certify the statutory snapshot.");

  revalidatePath("/statutory");
  statutoryRedirect("success", "Statutory snapshot certified. Its historical state is now protected.");
}
