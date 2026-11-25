"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const managers = new Set(["school_admin", "principal", "deputy_principal"]);
const uuid = z.string().uuid();
const approvalSchema = z.object({
  schemeId: uuid,
  enrolmentId: uuid,
  gradingScaleId: uuid,
  termNumber: z.coerce.number().int().min(1).max(3),
  confirmed: z.literal("yes"),
});

export type OfficialResultApprovalState = { success?: boolean; message: string };
export type ApprovalOption = { value: string; label: string; helper?: string; scaleKey?: string; scaleVersion?: string; historical?: boolean };
export type OfficialResultApprovalRow = {
  enrolmentId: string;
  name: string;
  admissionNumber: string | null;
  registered: boolean;
  approved: boolean;
  replacementEligible: boolean;
  gradingScaleKey: string | null;
  gradingScaleVersion: string | null;
  resultValue: number | null;
  symbol: string | null;
};
export type OfficialResultApprovalWorkspace = {
  academicYear: number;
  offerings: (ApprovalOption & { gradeId: string })[];
  schemes: (ApprovalOption & { offeringId: string; terms: number[] })[];
  classes: (ApprovalOption & { gradeId: string })[];
  scales: ApprovalOption[];
  offeringId: string;
  schemeId: string;
  classId: string;
  termNumber: number;
  termEnd: string | null;
  rows: OfficialResultApprovalRow[];
  page: number;
  pageCount: number;
  total: number;
  verifiedRequired: number;
  required: number;
  ready: boolean;
};

async function authorizedManager() {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.currentSchoolMembership;
  if (!membership || !managers.has(membership.roleKey)) return null;
  return { schoolId: membership.schoolId, db: await createSupabaseServerClient() };
}

function errorIfPresent(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Unable to load ${label}.`);
}

export async function getOfficialResultApprovalWorkspace(params: {
  offering?: string;
  scheme?: string;
  classId?: string;
  term?: string;
  page?: string;
} = {}): Promise<OfficialResultApprovalWorkspace | null> {
  const manager = await authorizedManager();
  if (!manager) return null;
  const { db, schoolId } = manager;
  const academicYear = getNamibiaCalendarYear();

  const [offeringsResult, schemesResult, classesResult, scalesResult] = await Promise.all([
    db.from("subject_offerings").select("id,subject_id,grade_id").eq("school_id", schoolId).eq("academic_year", academicYear).order("id").limit(1000),
    db.from("assessment_schemes").select("id,subject_offering_id,scheme_key,version,term_numbers").eq("school_id", schoolId).eq("academic_year", academicYear).eq("status", "active").order("version", { ascending: false }).limit(1000),
    db.from("register_classes").select("id,display_name,grade_id").eq("school_id", schoolId).eq("academic_year", academicYear).order("display_name").limit(500),
    db.from("grading_scales").select("id,scale_key,version,display_name,effective_from,effective_to,status").eq("school_id", schoolId).in("status", ["active", "superseded", "archived"]).order("display_name").limit(1000),
  ]);
  errorIfPresent(offeringsResult.error, "subject offerings");
  errorIfPresent(schemesResult.error, "active assessment schemes");
  errorIfPresent(classesResult.error, "register classes");
  errorIfPresent(scalesResult.error, "grading scales");

  const offerings = offeringsResult.data ?? [];
  const schemes = schemesResult.data ?? [];
  const classes = classesResult.data ?? [];
  const scales = scalesResult.data ?? [];
  const subjectIds = [...new Set(offerings.map((row) => row.subject_id))];
  const gradeIds = [...new Set(offerings.map((row) => row.grade_id))];
  const [subjectResult, gradeResult] = await Promise.all([
    subjectIds.length ? db.from("subjects").select("id,display_name").in("id", subjectIds) : Promise.resolve({ data: [], error: null }),
    gradeIds.length ? db.from("grades").select("id,display_name").in("id", gradeIds) : Promise.resolve({ data: [], error: null }),
  ]);
  errorIfPresent(subjectResult.error, "subjects");
  errorIfPresent(gradeResult.error, "grades");
  const subjectMap = new Map((subjectResult.data ?? []).map((row) => [row.id, row.display_name]));
  const gradeMap = new Map((gradeResult.data ?? []).map((row) => [row.id, row.display_name]));

  const offeringOptions = offerings.map((row) => ({
    value: row.id,
    gradeId: row.grade_id,
    label: `${subjectMap.get(row.subject_id) ?? "Subject"} · ${gradeMap.get(row.grade_id) ?? "Grade"}`,
  }));
  const schemeOptions = schemes.map((row) => ({
    value: row.id,
    offeringId: row.subject_offering_id,
    label: `${row.scheme_key} · ${row.version}`,
    terms: (row.term_numbers ?? [1, 2, 3]).map(Number),
  }));
  const classOptions = classes.map((row) => ({
    value: row.id,
    gradeId: row.grade_id,
    label: row.display_name,
  }));
  const offeringId = offeringOptions.some((row) => row.value === params.offering) ? params.offering! : "";
  const selectedOffering = offeringOptions.find((row) => row.value === offeringId);
  const validSchemes = schemeOptions.filter((row) => row.offeringId === offeringId);
  const schemeId = validSchemes.some((row) => row.value === params.scheme) ? params.scheme! : (validSchemes[0]?.value ?? "");
  const classId = classOptions.some((row) => row.value === params.classId && row.gradeId === selectedOffering?.gradeId)
    ? params.classId! : "";
  const parsedTerm = Number(params.term ?? 1);
  const termNumber = Number.isInteger(parsedTerm) && parsedTerm >= 1 && parsedTerm <= 3 ? parsedTerm : 1;
  // The grade version is applicable at the school-configured term end,
  // never at the later calendar date of approval or correction.
  const { data: academicYearRow, error: yearError } = await db.from("academic_years")
    .select("id").eq("school_id", schoolId).eq("year", academicYear).maybeSingle();
  errorIfPresent(yearError, "academic year");
  let termEnd: string | null = null;
  if (academicYearRow) {
    const { data: term, error: termError } = await db.from("academic_terms")
      .select("ends_on").eq("school_id", schoolId).eq("academic_year_id", academicYearRow.id)
      .eq("term_number", termNumber).maybeSingle();
    errorIfPresent(termError, "academic term");
    termEnd = term?.ends_on ?? null;
  }
  const scaleOptions: ApprovalOption[] = termEnd ? scales
    .filter((row) => row.status === "active" && row.effective_from <= termEnd &&
      (row.effective_to == null || row.effective_to >= termEnd))
    .map((row) => ({
      value: row.id,
      label: row.display_name,
      helper: `${row.scale_key} · ${row.version} · effective on ${termEnd}`,
      scaleKey: row.scale_key,
      scaleVersion: row.version,
    })) : [];
  const selectedScheme = validSchemes.find((row) => row.value === schemeId);
  const pageRaw = Number(params.page ?? 1);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 1000) : 1;
  const pageSize = 50;
  let required = 0;
  let verifiedRequired = 0;
  let pendingContributing = false;
  let total = 0;
  let rows: OfficialResultApprovalRow[] = [];

  if (selectedOffering && selectedScheme && classId && selectedScheme.terms.includes(termNumber)) {
    const [componentsResult, instancesResult, enrolmentsResult] = await Promise.all([
      db.from("assessment_components").select("id,required,contributes_to_report,term_numbers")
        .eq("assessment_scheme_id", schemeId),
      db.from("assessment_instances").select("id,assessment_component_id,status,correction_pending")
        .eq("school_id", schoolId).eq("assessment_scheme_id", schemeId)
        .eq("register_class_id", classId).eq("term_number", termNumber).neq("status", "cancelled"),
      db.from("enrolments").select("id,learner_id,admission_number", { count: "exact" })
        .eq("school_id", schoolId).eq("academic_year", academicYear)
        .eq("register_class_id", classId).eq("status", "current")
        .order("admission_number").range((page - 1) * pageSize, page * pageSize - 1),
    ]);
    errorIfPresent(componentsResult.error, "assessment components");
    errorIfPresent(instancesResult.error, "assessment verification");
    errorIfPresent(enrolmentsResult.error, "class learners");
    const contributing = new Set((componentsResult.data ?? [])
      .filter((row) => row.contributes_to_report && (row.term_numbers ?? [1, 2, 3]).includes(termNumber))
      .map((row) => row.id));
    const relevant = new Set((componentsResult.data ?? [])
      .filter((row) => row.required && contributing.has(row.id))
      .map((row) => row.id));
    pendingContributing = (instancesResult.data ?? []).some((row) =>
      contributing.has(row.assessment_component_id) && row.correction_pending);
    const requiredInstances = (instancesResult.data ?? []).filter((row) => relevant.has(row.assessment_component_id));
    required = requiredInstances.length;
    verifiedRequired = requiredInstances.filter((row) => ["verified", "locked"].includes(row.status) && !row.correction_pending).length;
    const enrolments = enrolmentsResult.data ?? [];
    total = enrolmentsResult.count ?? 0;
    const ids = enrolments.map((row) => row.id);
    const learnerIds = enrolments.map((row) => row.learner_id);
    const [learnersResult, registrationsResult, approvedResult] = await Promise.all([
      learnerIds.length ? db.from("learners").select("id,first_names,surname,preferred_name").in("id", learnerIds) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from("learner_subject_registrations").select("enrolment_id").in("enrolment_id", ids).eq("subject_offering_id", offeringId).eq("status", "active") : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from("official_results_current").select("enrolment_id,result_value,symbol,approved_at,grading_scale_key,grading_scale_version").in("enrolment_id", ids).eq("subject_offering_id", offeringId).eq("term_number", termNumber) : Promise.resolve({ data: [], error: null }),
    ]);
    errorIfPresent(learnersResult.error, "learner identities");
    errorIfPresent(registrationsResult.error, "subject registrations");
    errorIfPresent(approvedResult.error, "official results");
    const learnerMap = new Map((learnersResult.data ?? []).map((row) => [row.id, row]));
    const registered = new Set((registrationsResult.data ?? []).map((row) => row.enrolment_id));
    const officialMap = new Map((approvedResult.data ?? []).map((row) => [row.enrolment_id, row]));
    // Historical versions are selectable only when a current result on this
    // page already references their immutable school-unique key and version.
    // The row UI and canonical RPC independently prevent changing versions.
    if (termEnd) {
      const historicVersions = new Set((approvedResult.data ?? []).map(
        (row) => JSON.stringify([row.grading_scale_key, row.grading_scale_version]),
      ));
      for (const scale of scales) {
        if (scale.status === "active" || scale.effective_from > termEnd ||
          (scale.effective_to != null && scale.effective_to < termEnd) ||
          !historicVersions.has(JSON.stringify([scale.scale_key, scale.version]))) continue;
        scaleOptions.push({
          value: scale.id, label: scale.display_name,
          helper: `${scale.scale_key} · ${scale.version} · historical term version`,
          scaleKey: scale.scale_key, scaleVersion: scale.version, historical: true,
        });
      }
    }
    // Mirror the canonical RPC's evidence predicate for the *UI affordance*.
    // The RPC still owns the locked/atomic replacement decision and can deny
    // access if approval or correction state changes after this read.
    const corrected = new Set<string>();
    const candidateEnrolments = [...officialMap.keys()];
    const instanceIds = (instancesResult.data ?? [])
      .filter((row) => contributing.has(row.assessment_component_id)
        && ["verified", "locked"].includes(row.status) && !row.correction_pending)
      .map((row) => row.id);
    if (candidateEnrolments.length && instanceIds.length && required === verifiedRequired
      && required > 0 && !pendingContributing) {
      // Search the eligible version history in bounded PostgREST pages. A
      // full response page does not invalidate corrections already proven.
      // The authoritative RPC still validates authorization, locks the
      // contributing instances, and checks finality at mutation time.
      const pageSize = 500;
      for (let offset = 0; corrected.size < candidateEnrolments.length; offset += pageSize) {
        const { data: marks, error: marksError } = await db.from("learner_marks")
          .select("enrolment_id,recorded_at,correction_authorization_id")
          .in("enrolment_id", candidateEnrolments)
          .in("assessment_instance_id", instanceIds)
          .not("correction_authorization_id", "is", null)
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        errorIfPresent(marksError, "governed corrections");
        for (const mark of marks ?? []) {
          const prior = officialMap.get(mark.enrolment_id);
          if (mark.correction_authorization_id && prior?.approved_at && mark.recorded_at
            && Date.parse(mark.recorded_at) > Date.parse(prior.approved_at)) {
            corrected.add(mark.enrolment_id);
          }
        }
        if (!marks || marks.length < pageSize) break;
      }
    }
    rows = enrolments.map((row) => {
      const learner = learnerMap.get(row.learner_id);
      const official = officialMap.get(row.id);
      return {
        enrolmentId: row.id,
        name: learner ? `${learner.surname}, ${learner.preferred_name || learner.first_names}` : "Learner",
        admissionNumber: row.admission_number,
        registered: registered.has(row.id),
        approved: Boolean(official),
        replacementEligible: Boolean(official) && corrected.has(row.id),
        gradingScaleKey: official?.grading_scale_key ?? null,
        gradingScaleVersion: official?.grading_scale_version ?? null,
        resultValue: official?.result_value == null ? null : Number(official.result_value),
        symbol: official?.symbol ?? null,
      };
    });
  }

  return {
    academicYear, offerings: offeringOptions, schemes: schemeOptions, classes: classOptions,
    scales: scaleOptions, offeringId, schemeId, classId, termNumber, termEnd,
    rows, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), total,
    required, verifiedRequired, ready: required > 0 && required === verifiedRequired && !pendingContributing && Boolean(termEnd),
  };
}

export async function approveOfficialResult(
  _state: OfficialResultApprovalState,
  form: FormData,
): Promise<OfficialResultApprovalState> {
  const manager = await authorizedManager();
  if (!manager) return { message: "Official result approval requires current School Administration or school leadership authority." };
  const parsed = approvalSchema.safeParse({
    schemeId: form.get("schemeId"),
    enrolmentId: form.get("enrolmentId"),
    gradingScaleId: form.get("gradingScaleId"),
    termNumber: form.get("termNumber"),
    confirmed: form.get("confirmed"),
  });
  if (!parsed.success) return { message: "Select a learner, active scheme, configured grading scale and confirm approval." };
  const { schemeId, enrolmentId, gradingScaleId, termNumber } = parsed.data;
  const { db, schoolId } = manager;

  const [schemeResult, enrolmentResult, scaleResult] = await Promise.all([
    db.from("assessment_schemes").select("id,school_id,academic_year,subject_offering_id,status,term_numbers")
      .eq("id", schemeId).eq("school_id", schoolId).maybeSingle(),
    db.from("enrolments").select("id,school_id,academic_year,grade_id,status")
      .eq("id", enrolmentId).eq("school_id", schoolId).maybeSingle(),
    db.from("grading_scales").select("id,school_id,status")
      .eq("id", gradingScaleId).eq("school_id", schoolId).maybeSingle(),
  ]);
  if (schemeResult.error || enrolmentResult.error || scaleResult.error) return { message: "Unable to validate current academic authority. No result was approved." };
  const scheme = schemeResult.data;
  const enrolment = enrolmentResult.data;
  const scale = scaleResult.data;
  if (!scheme || !enrolment || !scale || scheme.status !== "active" || !["active", "superseded", "archived"].includes(scale.status)
    || enrolment.status !== "current" || enrolment.academic_year !== getNamibiaCalendarYear()
    || scheme.academic_year !== enrolment.academic_year || !(scheme.term_numbers ?? []).includes(termNumber)) {
    return { message: "Scheme, term, learner or grading scale is not active in this school and year." };
  }
  const { data: offering, error: offeringError } = await db.from("subject_offerings")
    .select("grade_id").eq("id", scheme.subject_offering_id).eq("school_id", schoolId).maybeSingle();
  if (offeringError || !offering || offering.grade_id !== enrolment.grade_id) {
    return { message: "The learner is not in the selected subject offering's grade." };
  }

  const { data: registration, error: registrationError } = await db.from("learner_subject_registrations")
    .select("id")
    .eq("school_id", schoolId)
    .eq("enrolment_id", enrolmentId)
    .eq("subject_offering_id", scheme.subject_offering_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (registrationError || !registration) {
    return { message: "The learner has no active registration for this subject offering. No result was approved." };
  }

  const { error } = await db.rpc("approve_official_subject_result", {
    p_assessment_scheme_id: schemeId,
    p_enrolment_id: enrolmentId,
    p_term_number: termNumber,
    p_grading_scale_id: gradingScaleId,
  });
  if (error) {
    if (error.message.includes("Configure the academic term end date")) {
      return { message: "Configure the school academic term end date before approving official results." };
    }
    if (error.message.includes("Corrected official result must reuse")) {
      return { message: "Corrections must use the original official grading scale version; changing grading policy requires a separate approved process." };
    }
    if (error.message.includes("Initial official approval requires")) {
      return { message: "New official results require an active grading scale." };
    }
    if (error.message.includes("The selected grading scale does not cover")) {
      return { message: "The selected grading scale is not effective on this academic term's end date." };
    }
    if (error.message.includes("All required contributing assessments")) return { message: "Required assessments must be verified before official approval." };
    if (error.message.includes("incomplete")) return { message: "This learner's assessment result is incomplete." };
    if (error.message.includes("grading band")) return { message: "The selected grading scale has no band for the calculated result." };
    if (error.message.includes("Contributing assessment corrections require")) return { message: "All contributing mark corrections, including optional components, require HOD re-verification before official approval." };
    if (error.message.includes("Existing official result requires")) return { message: "This result is already official. A corrected mark and re-verification are required before replacement." };
    return { message: "Official result approval was refused by academic governance. No result was changed." };
  }
  revalidatePath("/assessment/results");
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Official subject result approved and locked. Report-card generation is now available." };
}
