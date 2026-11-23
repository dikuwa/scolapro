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
export type ApprovalOption = { value: string; label: string; helper?: string };
export type OfficialResultApprovalRow = {
  enrolmentId: string;
  name: string;
  admissionNumber: string | null;
  registered: boolean;
  approved: boolean;
  replacementEligible: boolean;
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
    db.from("grading_scales").select("id,scale_key,version,display_name").eq("school_id", schoolId).eq("status", "active").order("display_name").limit(100),
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
  const scaleOptions = scales.map((row) => ({
    value: row.id,
    label: row.display_name,
    helper: `${row.scale_key} · ${row.version}`,
  }));

  const offeringId = offeringOptions.some((row) => row.value === params.offering) ? params.offering! : "";
  const selectedOffering = offeringOptions.find((row) => row.value === offeringId);
  const validSchemes = schemeOptions.filter((row) => row.offeringId === offeringId);
  const schemeId = validSchemes.some((row) => row.value === params.scheme) ? params.scheme! : (validSchemes[0]?.value ?? "");
  const classId = classOptions.some((row) => row.value === params.classId && row.gradeId === selectedOffering?.gradeId)
    ? params.classId! : "";
  const parsedTerm = Number(params.term ?? 1);
  const termNumber = Number.isInteger(parsedTerm) && parsedTerm >= 1 && parsedTerm <= 3 ? parsedTerm : 1;
  const selectedScheme = validSchemes.find((row) => row.value === schemeId);
  const pageRaw = Number(params.page ?? 1);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 1000) : 1;
  const pageSize = 50;
  let required = 0;
  let verifiedRequired = 0;
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
    const relevant = new Set((componentsResult.data ?? [])
      .filter((row) => row.required && row.contributes_to_report && (row.term_numbers ?? [1, 2, 3]).includes(termNumber))
      .map((row) => row.id));
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
      ids.length ? db.from("official_results_current").select("enrolment_id,result_value,symbol,approved_at").in("enrolment_id", ids).eq("subject_offering_id", offeringId).eq("term_number", termNumber) : Promise.resolve({ data: [], error: null }),
    ]);
    errorIfPresent(learnersResult.error, "learner identities");
    errorIfPresent(registrationsResult.error, "subject registrations");
    errorIfPresent(approvedResult.error, "official results");
    const learnerMap = new Map((learnersResult.data ?? []).map((row) => [row.id, row]));
    const registered = new Set((registrationsResult.data ?? []).map((row) => row.enrolment_id));
    const officialMap = new Map((approvedResult.data ?? []).map((row) => [row.enrolment_id, row]));
    // Mirror the canonical RPC's evidence predicate for the *UI affordance*.
    // The RPC still owns the locked/atomic replacement decision and can deny
    // access if approval or correction state changes after this read.
    const corrected = new Set<string>();
    const candidateEnrolments = [...officialMap.keys()];
    const instanceIds = (instancesResult.data ?? []).map((row) => row.id);
    if (candidateEnrolments.length && instanceIds.length && required === verifiedRequired && required > 0) {
      const { data: marks, error: marksError } = await db.from("learner_marks")
        .select("enrolment_id,assessment_instance_id,recorded_at,correction_authorization_id")
        .in("enrolment_id", candidateEnrolments)
        .in("assessment_instance_id", instanceIds)
        .not("correction_authorization_id", "is", null)
        .order("recorded_at", { ascending: false }).limit(1000);
      errorIfPresent(marksError, "governed corrections");
      const relevantMarks = (marks ?? []).filter((mark) => {
        const prior = officialMap.get(mark.enrolment_id);
        return Boolean(prior?.approved_at && mark.recorded_at &&
          Date.parse(mark.recorded_at) > Date.parse(prior.approved_at));
      });
      // Never offer reapproval if a response cap could have hidden some
      // evidence. The canonical RPC is the only way to approve replacements.
      if ((marks ?? []).length < 1000 && relevantMarks.length) {
        const authorizationIds = [...new Set(relevantMarks.map((mark) => mark.correction_authorization_id)
          .filter((id): id is string => typeof id === "string"))];
        if (authorizationIds.length) {
          const { data: authorizations, error: authorizationError } = await db
            .from("assessment_mark_reopen_authorizations")
            .select("id,requires_reverification")
            .eq("school_id", schoolId).in("id", authorizationIds);
          errorIfPresent(authorizationError, "correction authorizations");
          const permittedIds = new Set((authorizations ?? [])
            .filter((row) => row.requires_reverification).map((row) => row.id));
          for (const mark of relevantMarks) {
            if (mark.correction_authorization_id && permittedIds.has(mark.correction_authorization_id)) {
              corrected.add(mark.enrolment_id);
            }
          }
        }
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
        resultValue: official?.result_value == null ? null : Number(official.result_value),
        symbol: official?.symbol ?? null,
      };
    });
  }

  return {
    academicYear, offerings: offeringOptions, schemes: schemeOptions, classes: classOptions,
    scales: scaleOptions, offeringId, schemeId, classId, termNumber,
    rows, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), total,
    required, verifiedRequired, ready: required > 0 && required === verifiedRequired,
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
  if (!scheme || !enrolment || !scale || scheme.status !== "active" || scale.status !== "active"
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
    if (error.message.includes("All required contributing assessments")) return { message: "Required assessments must be verified before official approval." };
    if (error.message.includes("incomplete")) return { message: "This learner's assessment result is incomplete." };
    if (error.message.includes("grading band")) return { message: "The selected grading scale has no band for the calculated result." };
    if (error.message.includes("Existing official result requires")) return { message: "This result is already official. A corrected mark and re-verification are required before replacement." };
    return { message: "Official result approval was refused by academic governance. No result was changed." };
  }
  revalidatePath("/assessment/results");
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Official subject result approved and locked. Report-card generation is now available." };
}
