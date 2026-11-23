"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const leadership = new Set(["school_admin", "principal", "deputy_principal"]);
const uuid = z.string().uuid();
const band = z.object({
  minimum: z.number().min(0).max(100),
  maximum: z.number().min(0).max(100),
  symbol: z.string().trim().min(1).max(12),
  classification: z.enum(["pass", "fail", "neutral"]),
}).refine((value) => value.maximum >= value.minimum);
const bandsSchema = z.array(band).min(1).max(30);
const createSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/),
  version: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(2).max(160),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().optional(),
  precision: z.coerce.number().int().min(0).max(4),
  bands: bandsSchema,
}).refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom);
const editSchema = z.object({ scaleId: uuid, bands: bandsSchema });
const activationSchema = z.object({ scaleId: uuid, confirmed: z.literal("yes"), reviewedBands: bandsSchema });

export type GradingBandInput = z.infer<typeof band>;
export type GradingScaleActionState = { success?: boolean; message: string };
export type SchoolGradingScale = {
  id: string;
  key: string;
  version: string;
  displayName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  decimalPlaces: number;
  status: string;
  bands: (GradingBandInput & { id: string })[];
};

async function manager() {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.currentSchoolMembership;
  if (!membership || !leadership.has(membership.roleKey)) return null;
  return { schoolId: membership.schoolId, db: await createSupabaseServerClient() };
}

function parseBands(form: FormData) {
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("bands") ?? "")); }
  catch { return null; }
  return bandsSchema.safeParse(raw);
}

function readBackMatches(
  saved: Array<{ minimum_value: number | string; maximum_value: number | string | null; symbol: string; pass_classification: string | null }> | null,
  expected: GradingBandInput[],
) {
  return saved?.length === expected.length && expected.every((band, index) => {
    const row = saved[index];
    return Number(row.minimum_value) === band.minimum
      && Number(row.maximum_value) === band.maximum
      && row.symbol === band.symbol
      && row.pass_classification === band.classification;
  });
}

function refresh() {
  revalidatePath("/assessment/grading-scales");
  revalidatePath("/assessment/results");
  revalidatePath("/assessment");
}

export async function getSchoolGradingScales(): Promise<SchoolGradingScale[] | null> {
  const scope = await manager();
  if (!scope) return null;
  // Retrieve every version, including drafts older than the first 100.
  // Each band batch covers <=25 scales × 30 bands = 750 rows, below the
  // configured PostgREST 1,000-row response cap.
  type ScaleRow = { id: string; scale_key: string; version: string; display_name: string; effective_from: string; effective_to: string | null; decimal_places: number; status: string };
  const scales: ScaleRow[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await scope.db.from("grading_scales")
      .select("id,scale_key,version,display_name,effective_from,effective_to,decimal_places,status")
      .eq("school_id", scope.schoolId).order("created_at", { ascending: false })
      .order("id").range(offset, offset + 99);
    if (error) throw new Error("Unable to load school grading scales.");
    scales.push(...(data ?? []));
    if (!data || data.length < 100) break;
  }
  const ids = scales.map((item) => item.id);
  type BandRow = { id: string; grading_scale_id: string; minimum_value: number | string; maximum_value: number | string; symbol: string; pass_classification: string | null };
  const rows: BandRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 25) {
    const { data, error } = await scope.db.from("grading_scale_bands")
      .select("id,grading_scale_id,minimum_value,maximum_value,symbol,pass_classification")
      .eq("school_id", scope.schoolId).in("grading_scale_id", ids.slice(offset, offset + 25))
      .order("sort_order");
    if (error) throw new Error("Unable to load grading scale bands.");
    // Do not expose a partially fetched definition for editing.
    if ((data ?? []).length >= 1000) throw new Error("Grading band response exceeded the safe page size.");
    rows.push(...(data ?? []));
  }
  const grouped = new Map<string, SchoolGradingScale["bands"]>();
  for (const row of rows ?? []) {
    const list = grouped.get(row.grading_scale_id) ?? [];
    list.push({
      id: row.id, minimum: Number(row.minimum_value), maximum: Number(row.maximum_value),
      symbol: row.symbol, classification: row.pass_classification === "pass" || row.pass_classification === "fail" ? row.pass_classification : "neutral",
    });
    grouped.set(row.grading_scale_id, list);
  }
  return (scales ?? []).map((scale) => ({
    id: scale.id, key: scale.scale_key, version: scale.version,
    displayName: scale.display_name, effectiveFrom: scale.effective_from,
    effectiveTo: scale.effective_to, decimalPlaces: scale.decimal_places,
    status: scale.status, bands: grouped.get(scale.id) ?? [],
  }));
}

export async function createSchoolGradingScale(
  _state: GradingScaleActionState, form: FormData,
): Promise<GradingScaleActionState> {
  const scope = await manager();
  if (!scope) return { message: "Only current school management can configure grading scales." };
  const parsedBands = parseBands(form);
  if (!parsedBands?.success) return { message: "Provide valid numeric grading bands, with a symbol for every band." };
  const parsed = createSchema.safeParse({
    key: form.get("key"), version: form.get("version"),
    displayName: form.get("displayName"), effectiveFrom: form.get("effectiveFrom"),
    effectiveTo: String(form.get("effectiveTo") ?? "") || undefined,
    precision: form.get("precision"), bands: parsedBands.data,
  });
  if (!parsed.success) return { message: "Enter the scale identity, version, effective date, precision, and valid bands." };
  const value = parsed.data;
  const { data: id, error } = await scope.db.rpc("create_school_grading_scale", {
    p_school_id: scope.schoolId, p_scale_key: value.key,
    p_version: value.version, p_display_name: value.displayName,
    p_effective_from: value.effectiveFrom, p_effective_to: value.effectiveTo ?? null,
    p_decimal_places: value.precision,
    p_bands: value.bands,
  });
  if (error) return { message: error.code === "23505" ? "This school already has that grading scale key and version." : "Draft scale creation was refused. Review band values, school permissions and version." };
  const { data: saved, error: readError } = await scope.db.from("grading_scales")
    .select("id,status").eq("school_id", scope.schoolId).eq("id", String(id)).single();
  if (readError || !saved || saved.status !== "draft") return { message: "Draft scale could not be verified after saving." };
  const { data: savedBands, error: bandReadError } = await scope.db.from("grading_scale_bands")
    .select("minimum_value,maximum_value,symbol,pass_classification")
    .eq("school_id", scope.schoolId).eq("grading_scale_id", String(id)).order("sort_order");
  if (bandReadError || !readBackMatches(savedBands, value.bands)) {
    return { message: "Draft was created but its saved bands could not be verified. Review version history before retrying." };
  }
  refresh();
  return { success: true, message: "Draft grading scale saved. Review and activate it separately." };
}

export async function replaceSchoolGradingScaleDraftBands(
  _state: GradingScaleActionState, form: FormData,
): Promise<GradingScaleActionState> {
  const scope = await manager();
  if (!scope) return { message: "Only current school management can edit draft grading bands." };
  const bands = parseBands(form);
  const parsed = editSchema.safeParse({ scaleId: form.get("scaleId"), bands: bands?.success ? bands.data : null });
  if (!parsed.success) return { message: "Select a draft version and supply valid grading bands." };
  const { data: scale, error: readError } = await scope.db.from("grading_scales")
    .select("status").eq("id", parsed.data.scaleId).eq("school_id", scope.schoolId).maybeSingle();
  if (readError || !scale || scale.status !== "draft") return { message: "Only an existing draft scale can be edited." };
  const { data: updated, error } = await scope.db.rpc("replace_school_grading_scale_draft_bands", {
    p_scale_id: parsed.data.scaleId, p_bands: parsed.data.bands,
  });
  if (error || updated !== true) return { message: "Draft band replacement was refused; no partial revision was saved." };
  const { data: savedBands, error: verifyError } = await scope.db.from("grading_scale_bands")
    .select("minimum_value,maximum_value,symbol,pass_classification")
    .eq("school_id", scope.schoolId).eq("grading_scale_id", parsed.data.scaleId).order("sort_order");
  if (verifyError || !readBackMatches(savedBands, parsed.data.bands)) {
    return { message: "Band revision could not be verified. Review version history before retrying." };
  }
  refresh();
  return { success: true, message: "Draft grading bands updated." };
}

export async function activateSchoolGradingScale(
  _state: GradingScaleActionState, form: FormData,
): Promise<GradingScaleActionState> {
  const scope = await manager();
  if (!scope) return { message: "Only current school management can activate a grading scale." };
  let reviewedBands: unknown;
  try { reviewedBands = JSON.parse(String(form.get("reviewedBands") ?? "")); }
  catch { return { message: "Reload and review the current grading bands before activation." }; }
  const parsed = activationSchema.safeParse({
    scaleId: form.get("scaleId"), confirmed: form.get("confirmed"), reviewedBands,
  });
  if (!parsed.success) return { message: "Choose a draft grading scale and explicitly confirm activation." };
  const { data: scale, error: readError } = await scope.db.from("grading_scales")
    .select("status").eq("id", parsed.data.scaleId).eq("school_id", scope.schoolId).maybeSingle();
  if (readError || !scale || scale.status !== "draft") return { message: "Only an existing draft scale can be activated." };
  const { error } = await scope.db.rpc("activate_school_grading_scale", { p_scale_id: parsed.data.scaleId, p_reviewed_bands: parsed.data.reviewedBands });
  if (error) {
    if (error.message.includes("overlaps or gaps") || error.message.includes("completely cover")) {
      return { message: "Bands must exactly cover 0–100, without gaps or overlaps, at the configured decimal precision." };
    }
    if (error.message.includes("Reviewed grading bands changed")) {
      return { message: "The saved grading bands changed after review. Reload and confirm the latest version." };
    }
    if (error.message.includes("effective period")) {
      return { message: "This grading scale is outside its effective period." };
    }
    return { message: "Scale activation was refused. Verify numeric coverage and school authority." };
  }
  const { data: verified, error: verifyError } = await scope.db.from("grading_scales")
    .select("status").eq("id", parsed.data.scaleId).eq("school_id", scope.schoolId).single();
  if (verifyError || verified?.status !== "active") return { message: "Activation status could not be verified." };
  refresh();
  return { success: true, message: "Grading scale activated and frozen. Create a new version for future changes." };
}
