"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GovernanceActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const sourceSchema = z.object({
  authority: z.string().trim().min(2).max(80),
  sourceKey: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i, "Use letters, numbers, hyphens, underscores or dots."),
  title: z.string().trim().min(4).max(500),
  sourceUrl: z.string().trim().url("Enter the official source URL."),
  sourceDocumentDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  checksum: z.string().trim().min(8, "Checksum is required."),
  provenance: z.string().trim().min(2, "Provenance JSON is required."),
});

const lifecycleSchema = z.object({
  entityType: z.enum(["profile", "allocation", "constraint"]),
  entityId: z.string().uuid(),
  action: z.enum(["return_to_draft", "verify", "publish", "supersede", "withdraw"]),
  conflictReason: z.string().trim().max(1000).optional(),
});

const sourceLifecycleSchema = z.object({
  sourceId: z.string().uuid(),
  action: z.enum(["verify", "withdraw"]),
});

const supersessionSchema = z.object({
  entityType: z.enum(["profile", "allocation", "constraint"]),
  entityId: z.string().uuid(),
  predecessorId: z.string().uuid(),
});

async function requirePlatformAdmin() {
  const context = await getUserContext();
  return Boolean(context.user && context.platformMemberships.some((membership) => membership.roleKey === "platform_admin"));
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function refresh() {
  revalidatePath("/platform/curriculum-policy");
}

export async function registerCurriculumTimeSource(
  _previous: GovernanceActionState,
  formData: FormData,
): Promise<GovernanceActionState> {
  const parsed = sourceSchema.safeParse({
    authority: formData.get("authority"),
    sourceKey: formData.get("sourceKey"),
    title: formData.get("title"),
    sourceUrl: formData.get("sourceUrl"),
    sourceDocumentDate: formData.get("sourceDocumentDate") ?? "",
    checksum: formData.get("checksum"),
    provenance: formData.get("provenance"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const provenance = parseJsonObject(parsed.data.provenance);
  if (!provenance || !Object.keys(provenance).length) return { message: "Provenance must be a non-empty JSON object." };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("curriculum_sources").insert({
    authority: parsed.data.authority,
    source_key: parsed.data.sourceKey,
    title: parsed.data.title,
    source_url: parsed.data.sourceUrl,
    source_document_date: parsed.data.sourceDocumentDate || null,
    checksum: parsed.data.checksum,
    provenance,
    status: "imported",
  });
  if (error) return { message: error.code === "23505" ? "That source key already exists." : "The source could not be registered." };
  refresh();
  return { success: true, message: "Official source registered as imported. Human verification is still required." };
}

export async function transitionCurriculumSource(
  _previous: GovernanceActionState,
  formData: FormData,
): Promise<GovernanceActionState> {
  const parsed = sourceLifecycleSchema.safeParse({ sourceId: formData.get("sourceId"), action: formData.get("action") });
  if (!parsed.success) return { message: "Invalid source review action." };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };
  const supabase = await createSupabaseServerClient();
  const targetStatus = parsed.data.action === "verify" ? "verified" : "withdrawn";
  const { error } = await supabase.from("curriculum_sources").update({ status: targetStatus }).eq("id", parsed.data.sourceId);
  if (error) return { message: error.message };
  refresh();
  return { success: true, message: parsed.data.action === "verify" ? "Source marked verified by the current reviewer." : "Source withdrawn." };
}

const tableByEntity = {
  profile: "curriculum_time_profiles",
  allocation: "curriculum_time_allocations",
  constraint: "curriculum_scheduling_constraints",
} as const;

export async function transitionCurriculumTimeRule(
  _previous: GovernanceActionState,
  formData: FormData,
): Promise<GovernanceActionState> {
  const parsed = lifecycleSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    action: formData.get("action"),
    conflictReason: formData.get("conflictReason") ?? "",
  });
  if (!parsed.success) return { message: "Invalid governance lifecycle action." };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const table = tableByEntity[parsed.data.entityType];
  const statusByAction = {
    return_to_draft: "draft",
    verify: "verified",
    publish: "published",
    supersede: "superseded",
    withdraw: "withdrawn",
  } as const;
  const update: Record<string, unknown> = { status: statusByAction[parsed.data.action] };

  if (parsed.data.entityType === "allocation" && parsed.data.action === "publish") {
    update.conflict_acknowledgement_reason = parsed.data.conflictReason || null;
  }

  if (parsed.data.action === "supersede") {
    const relation = parsed.data.entityType === "profile"
      ? ["curriculum_time_profiles", "supersedes_profile_id"] as const
      : parsed.data.entityType === "allocation"
        ? ["curriculum_time_allocations", "supersedes_allocation_id"] as const
        : ["curriculum_scheduling_constraints", "supersedes_constraint_id"] as const;
    const [successorTable, field] = relation;
    const { data: successor } = await supabase.from(successorTable).select("id,status").eq(field, parsed.data.entityId).in("status", ["published", "superseded"]).limit(1).maybeSingle();
    if (!successor) return { message: "Publish a valid successor that explicitly references this record before marking it superseded." };
  }

  const { error } = await supabase.from(table).update(update).eq("id", parsed.data.entityId);
  if (error) return { message: error.message };
  refresh();
  return { success: true, message: parsed.data.entityType.replaceAll("_", " ") + " " + statusByAction[parsed.data.action] + "." };
}

export async function setCurriculumTimeSupersession(
  _previous: GovernanceActionState,
  formData: FormData,
): Promise<GovernanceActionState> {
  const parsed = supersessionSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    predecessorId: formData.get("predecessorId"),
  });
  if (!parsed.success) return { message: "Choose a valid predecessor." };
  if (parsed.data.entityId === parsed.data.predecessorId) return { message: "A record cannot supersede itself." };
  if (!(await requirePlatformAdmin())) return { message: "Platform administrator authority is required." };

  const supabase = await createSupabaseServerClient();
  const table = tableByEntity[parsed.data.entityType];
  const field = parsed.data.entityType === "profile"
    ? "supersedes_profile_id"
    : parsed.data.entityType === "allocation"
      ? "supersedes_allocation_id"
      : "supersedes_constraint_id";

  const { data: current } = await supabase.from(table).select("id,status").eq("id", parsed.data.entityId).maybeSingle();
  if (!current || current.status !== "draft") return { message: "Supersession can only be edited while the successor is in draft." };

  const { error } = await supabase.from(table).update({ [field]: parsed.data.predecessorId }).eq("id", parsed.data.entityId);
  if (error) return { message: error.message };
  refresh();
  return { success: true, message: "Explicit supersession predecessor saved." };
}
