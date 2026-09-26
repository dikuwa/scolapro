"use server";

import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const leaderRoles = new Set(["school_admin","principal","deputy_principal","hod"]);

export type AssessmentSchemeActionState = { success?: boolean; message: string };

export type AssessmentSchemeOffering = {
  id: string;
  subject: string;
  grade: string;
  curriculumVersion: string | null;
  curriculumVersionId: string | null;
};

export type AssessmentSchemeCandidate = {
  id: string;
  offeringId: string;
  sourceKind: string;
  sourceLabel: string;
  status: string;
  captureMode: string;
  termNumbers: number[];
  components: Array<{
    code: string;
    name: string;
    type: string;
    rawMax: number | null;
    weight: number | null;
    required: boolean;
    termNumbers: number[];
    moderationRequired: boolean;
  }>;
  verifiedAt: string | null;
};

export type AssessmentSchemeWorkspaceData = {
  schoolId: string;
  academicYear: number;
  offerings: AssessmentSchemeOffering[];
  candidates: AssessmentSchemeCandidate[];
  activeSchemes: Array<{
    id: string;
    offeringId: string;
    schemeKey: string;
    version: string;
    captureMode: string;
    termNumbers: number[];
    curriculumVersionId: string | null;
  }>;
};

async function leaderContext() {
  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) return null;
  const membership = context.memberships.find((item) => leaderRoles.has(item.roleKey));
  if (!membership) return null;
  const db = await createSupabaseServerClient();
  return { context, membership, db };
}

export async function getAssessmentSchemeWorkspace(): Promise<AssessmentSchemeWorkspaceData | null> {
  const scope = await leaderContext();
  if (!scope) return null;
  const academicYear = getNamibiaCalendarYear();
  const { data: offerings } = await scope.db.from("subject_offerings")
    .select("id,subject_id,grade_id,curriculum_version_id")
    .eq("school_id", scope.membership.schoolId)
    .eq("academic_year", academicYear);

  const subjectIds=[...new Set((offerings ?? []).map((row) => row.subject_id))];
  const gradeIds=[...new Set((offerings ?? []).map((row) => row.grade_id))];
  const versionIds=[...new Set((offerings ?? []).map((row) => row.curriculum_version_id).filter(Boolean))] as string[];

  const [{ data: subjects }, { data: grades }, { data: versions }, { data: candidates }, { data: schemes }] = await Promise.all([
    subjectIds.length ? scope.db.from("subjects").select("id,display_name").in("id",subjectIds) : Promise.resolve({ data: [] }),
    gradeIds.length ? scope.db.from("grades").select("id,display_name").in("id",gradeIds) : Promise.resolve({ data: [] }),
    versionIds.length ? scope.db.from("curriculum_versions").select("id,version_key").in("id",versionIds) : Promise.resolve({ data: [] }),
    scope.db.from("assessment_scheme_candidates")
      .select("id,subject_offering_id,source_kind,source_snapshot,candidate,status,verified_at")
      .eq("school_id",scope.membership.schoolId)
      .eq("academic_year",academicYear)
      .order("created_at",{ascending:false}),
    scope.db.from("assessment_schemes")
      .select("id,subject_offering_id,scheme_key,version,capture_mode,term_numbers,curriculum_version_id,status")
      .eq("school_id",scope.membership.schoolId)
      .eq("academic_year",academicYear)
      .eq("status","active"),
  ]);

  const subjectMap=new Map((subjects ?? []).map((row) => [row.id,row.display_name]));
  const gradeMap=new Map((grades ?? []).map((row) => [row.id,row.display_name]));
  const versionMap=new Map((versions ?? []).map((row) => [row.id,row.version_key]));

  return {
    schoolId: scope.membership.schoolId,
    academicYear,
    offerings: (offerings ?? []).map((row) => ({
      id: row.id,
      subject: subjectMap.get(row.subject_id) ?? "Subject",
      grade: gradeMap.get(row.grade_id) ?? "Grade",
      curriculumVersion: row.curriculum_version_id ? versionMap.get(row.curriculum_version_id) ?? null : null,
      curriculumVersionId: row.curriculum_version_id ?? null,
    })),
    candidates: (candidates ?? []).map((row) => {
      const candidate=(row.candidate && typeof row.candidate==="object" ? row.candidate : {}) as Record<string, unknown>;
      const snapshot=(row.source_snapshot && typeof row.source_snapshot==="object" ? row.source_snapshot : {}) as Record<string, unknown>;
      const components=Array.isArray(candidate.components) ? candidate.components : [];
      const terms=Array.isArray(candidate.termNumbers) ? candidate.termNumbers : Array.isArray(candidate.term_numbers) ? candidate.term_numbers : [1,2,3];
      return {
        id: row.id,
        offeringId: row.subject_offering_id,
        sourceKind: row.source_kind,
        sourceLabel: String(snapshot.sourceTitle ?? snapshot.curriculumVersion ?? (row.source_kind==="manual" ? "Manual configuration" : "Curriculum source")),
        status: row.status,
        captureMode: String(candidate.captureMode ?? candidate.capture_mode ?? "detailed"),
        termNumbers: terms.map(Number).filter((value) => value>=1 && value<=3),
        components: components.map((value) => {
          const item=(value && typeof value==="object" ? value : {}) as Record<string, unknown>;
          const itemTerms=Array.isArray(item.termNumbers) ? item.termNumbers : terms;
          return {
            code: String(item.code ?? ""),
            name: String(item.name ?? "Component"),
            type: String(item.type ?? "other"),
            rawMax: item.rawMax == null || item.rawMax === "" ? null : Number(item.rawMax),
            weight: item.weight == null || item.weight === "" ? null : Number(item.weight),
            required: item.required !== false,
            termNumbers: itemTerms.map(Number).filter((number) => number>=1 && number<=3),
            moderationRequired: item.moderationRequired === true,
          };
        }),
        verifiedAt: row.verified_at ?? null,
      };
    }),
    activeSchemes: (schemes ?? []).map((row) => ({
      id: row.id,
      offeringId: row.subject_offering_id,
      schemeKey: row.scheme_key,
      version: row.version,
      captureMode: row.capture_mode,
      termNumbers: row.term_numbers ?? [1,2,3],
      curriculumVersionId: row.curriculum_version_id ?? null,
    })),
  };
}

function text(form: FormData,key: string) { return String(form.get(key) ?? "").trim(); }

export async function extractAssessmentSchemeCandidate(
  _state: AssessmentSchemeActionState,
  form: FormData,
): Promise<AssessmentSchemeActionState> {
  const scope=await leaderContext();
  const offeringId=text(form,"offeringId");
  if (!scope || !offeringId) return { message:"Choose a subject and grade." };
  const { error }=await scope.db.rpc("extract_assessment_scheme_candidate",{p_subject_offering_id:offeringId});
  if (error) {
    if (error.message.includes("No structured assessment configuration")) return { message:"This curriculum version has no structured assessment candidate yet. Use manual configuration and verify it before publishing." };
    return { message:"Assessment candidate could not be extracted from the verified curriculum source." };
  }
  revalidatePath("/assessment/schemes");
  return { success:true,message:"Candidate extracted from the verified curriculum source. Review it before verification." };
}

export async function createManualAssessmentSchemeCandidate(
  _state: AssessmentSchemeActionState,
  form: FormData,
): Promise<AssessmentSchemeActionState> {
  const scope=await leaderContext();
  if (!scope) return { message:"Academic leadership authority is required." };
  const offeringId=text(form,"offeringId");
  const captureMode=text(form,"captureMode");
  const termNumbers=text(form,"termNumbers").split(",").map(Number).filter((value)=>value>=1 && value<=3);
  let components: unknown[]=[];
  try { components=JSON.parse(text(form,"components") || "[]"); } catch { return { message:"Assessment components are invalid." }; }
  if (!offeringId || !["detailed","final_result"].includes(captureMode) || !termNumbers.length) return { message:"Subject, capture mode and at least one term are required." };
  if (captureMode==="detailed" && !components.length) return { message:"Detailed schemes require at least one component." };

  const { data: offering }=await scope.db.from("subject_offerings")
    .select("id,tenant_id,school_id,academic_year,curriculum_version_id")
    .eq("id",offeringId).eq("school_id",scope.membership.schoolId).maybeSingle();
  if (!offering?.curriculum_version_id) return { message:"This subject offering is not linked to an authoritative curriculum version." };
  const { data: version }=await scope.db.from("curriculum_versions").select("id,version_key,source_id").eq("id",offering.curriculum_version_id).maybeSingle();
  if (!version) return { message:"Curriculum version is unavailable." };

  const { error }=await scope.db.from("assessment_scheme_candidates").insert({
    tenant_id:offering.tenant_id,
    school_id:offering.school_id,
    academic_year:offering.academic_year,
    subject_offering_id:offering.id,
    curriculum_version_id:offering.curriculum_version_id,
    curriculum_source_id:version.source_id,
    source_kind:"manual",
    source_snapshot:{curriculumVersion:version.version_key},
    candidate:{
      schemeKey:"school-verified",
      version:`${offering.academic_year}-${Date.now()}`,
      captureMode,
      termNumbers,
      components,
    },
    extracted_by_user_id:scope.context.user!.id,
  });
  if (error) return { message:"Manual assessment candidate could not be saved." };
  revalidatePath("/assessment/schemes");
  return { success:true,message:"Manual candidate saved. A leader must verify it before publication." };
}

export async function verifyAssessmentSchemeCandidate(
  _state: AssessmentSchemeActionState,
  form: FormData,
): Promise<AssessmentSchemeActionState> {
  const scope=await leaderContext();
  if (!scope) return { message:"Academic leadership authority is required." };
  const candidateId=text(form,"candidateId");
  const { error }=await scope.db.rpc("verify_assessment_scheme_candidate",{p_candidate_id:candidateId,p_note:text(form,"note") || null});
  if (error) return { message:"Candidate could not be verified." };
  revalidatePath("/assessment/schemes");
  return { success:true,message:"Candidate verified. Publication is still a separate action." };
}

export async function publishAssessmentSchemeCandidate(
  _state: AssessmentSchemeActionState,
  form: FormData,
): Promise<AssessmentSchemeActionState> {
  const scope=await leaderContext();
  if (!scope) return { message:"Academic leadership authority is required." };
  const candidateId=text(form,"candidateId");
  const { error }=await scope.db.rpc("publish_assessment_scheme_candidate",{p_candidate_id:candidateId});
  if (error) return { message:error.message.includes("Human verification") ? "Human verification is required before publication." : "Verified scheme could not be published." };
  revalidatePath("/assessment");
  revalidatePath("/assessment/schemes");
  return { success:true,message:"Verified assessment scheme published for this subject, grade and curriculum version." };
}
