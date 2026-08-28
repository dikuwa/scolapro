import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

export type ParentChildSummary = {
  learnerId: string;
  enrolmentId: string | null;
  name: string;
  preferredName: string | null;
  admissionNumber: string | null;
  academicYear: number | null;
  schoolId: string | null;
  schoolName: string | null;
  grade: string | null;
  registerClass: string | null;
};

export type ParentPublishedReport = {
  id: string;
  learnerId: string;
  termNumber: number;
  snapshotVersion: number;
  publishedAt: string | null;
  certifiedAt: string | null;
  dataSnapshot: JsonRecord;
};

export type ClaimableGuardianProfile = {
  guardianId: string;
  tenantId: string;
  displayName: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export async function getParentPortalData() {
  const supabase = await createSupabaseServerClient();
  const { data: overviewData, error: overviewError } = await supabase.rpc("get_parent_family_overview");
  if (overviewError) throw new Error("Unable to load your family overview.");

  const overview = record(overviewData);
  const rawChildren = Array.isArray(overview.children) ? overview.children : [];
  const children: ParentChildSummary[] = rawChildren.map((value) => {
    const child = record(value);
    return {
      learnerId: String(child.learner_id ?? ""),
      enrolmentId: child.enrolment_id ? String(child.enrolment_id) : null,
      name: String(child.name ?? "Learner"),
      preferredName: child.preferred_name ? String(child.preferred_name) : null,
      admissionNumber: child.admission_number ? String(child.admission_number) : null,
      academicYear: typeof child.academic_year === "number" ? child.academic_year : null,
      schoolId: child.school_id ? String(child.school_id) : null,
      schoolName: child.school_name ? String(child.school_name) : null,
      grade: child.grade ? String(child.grade) : null,
      registerClass: child.register_class ? String(child.register_class) : null,
    };
  }).filter((child) => child.learnerId);

  const learnerIds = children.map((child) => child.learnerId);
  const reports: ParentPublishedReport[] = [];
  if (learnerIds.length) {
    const { data, error } = await supabase
      .from("report_card_snapshots")
      .select("id,learner_id,term_number,snapshot_version,published_at,certified_at,data_snapshot")
      .in("learner_id", learnerIds)
      .eq("status", "published")
      .order("term_number", { ascending: false })
      .order("snapshot_version", { ascending: false });
    if (error) throw new Error("Unable to load published reports.");
    for (const row of data ?? []) {
      reports.push({
        id: row.id,
        learnerId: row.learner_id,
        termNumber: row.term_number,
        snapshotVersion: row.snapshot_version,
        publishedAt: row.published_at,
        certifiedAt: row.certified_at,
        dataSnapshot: record(row.data_snapshot),
      });
    }
  }

  const { data: claimableData, error: claimableError } = await supabase.rpc("find_claimable_guardian_profiles");
  if (claimableError) throw new Error("Unable to check guardian-account matches.");
  const claimable: ClaimableGuardianProfile[] = (claimableData ?? []).map((row: { guardian_id: string; tenant_id: string; display_name: string }) => ({
    guardianId: row.guardian_id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
  }));

  return { children, reports, claimable };
}
