import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardLearner = {
  enrolmentId: string;
  learnerId: string;
  name: string;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
};

export type ReportCardSnapshotRow = {
  id: string;
  enrolmentId: string;
  learnerId: string;
  termNumber: number;
  snapshotVersion: number;
  templateVersion: string;
  status: string;
  generatedAt: string;
  certifiedAt: string | null;
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export async function getReportCardWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();
  const [enrolmentsResult, snapshotsResult, termsResult] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id,learner_id,admission_number,learners(first_names,surname),grades(display_name),register_classes(display_name)")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .eq("status", "current")
      .order("admission_number"),
    supabase
      .from("report_card_snapshots")
      .select("id,enrolment_id,learner_id,term_number,snapshot_version,template_version,status,generated_at,certified_at")
      .eq("school_id", schoolId)
      .eq("academic_year", academicYear)
      .order("generated_at", { ascending: false }),
    supabase
      .from("academic_terms")
      .select("term_number,display_name,academic_years!inner(year)")
      .eq("school_id", schoolId)
      .eq("academic_years.year", academicYear)
      .order("term_number"),
  ]);

  const error = enrolmentsResult.error || snapshotsResult.error || termsResult.error;
  if (error) throw new Error("Unable to load report-card workspace.");

  const learners: ReportCardLearner[] = (enrolmentsResult.data ?? []).map((item) => {
    const learner = one(item.learners);
    return {
      enrolmentId: item.id,
      learnerId: item.learner_id,
      name: learner ? `${learner.first_names} ${learner.surname}` : "Learner",
      admissionNumber: item.admission_number,
      grade: one(item.grades)?.display_name ?? "Grade",
      registerClass: one(item.register_classes)?.display_name ?? "Class",
    };
  });

  const snapshots: ReportCardSnapshotRow[] = (snapshotsResult.data ?? []).map((item) => ({
    id: item.id,
    enrolmentId: item.enrolment_id,
    learnerId: item.learner_id,
    termNumber: item.term_number,
    snapshotVersion: item.snapshot_version,
    templateVersion: item.template_version,
    status: item.status,
    generatedAt: item.generated_at,
    certifiedAt: item.certified_at,
  }));

  const terms = (termsResult.data ?? []).map((item) => ({ termNumber: item.term_number, name: item.display_name }));
  if (!terms.length) terms.push({ termNumber: 1, name: "Term 1" }, { termNumber: 2, name: "Term 2" }, { termNumber: 3, name: "Term 3" });

  return { learners, snapshots, terms };
}
