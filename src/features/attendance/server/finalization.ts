import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OfficialAttendanceSummaryFinalization = {
  snapshotId: string;
  revision: number;
  status: "finalized" | "superseded" | "revoked";
  scolaproReference: string;
  verificationToken: string;
  verificationPath: string;
  finalizedAt: string;
  supersedesSnapshotId: string | null;
  dataSnapshot: unknown;
};

/**
 * Resolves the latest finalized Official Attendance Summary version for an exact
 * reporting scope. Returns null when nothing has been finalized yet (so the UI
 * never exposes a draft or un-finalized state).
 */
export async function getOfficialAttendanceSummaryFinalization(input: {
  schoolId: string;
  mode: "week" | "term";
  scopeStart: string;
  scopeEnd: string;
  termId?: string | null;
}): Promise<OfficialAttendanceSummaryFinalization | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_official_attendance_summary_finalization", {
    p_school_id: input.schoolId,
    p_mode: input.mode,
    p_scope_start: input.scopeStart,
    p_scope_end: input.scopeEnd,
    p_term_id: input.termId ?? null,
  });
  if (error) {
    console.error("official attendance summary finalization lookup failed", error.message);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        snapshot_id: string;
        revision: number;
        status: string;
        scolapro_reference: string;
        verification_token: string;
        verification_path: string;
        finalized_at: string;
        supersedes_snapshot_id: string | null;
        data_snapshot: unknown;
      }
    | undefined;
  if (!row) return null;

  return {
    snapshotId: row.snapshot_id,
    revision: row.revision,
    status: row.status as OfficialAttendanceSummaryFinalization["status"],
    scolaproReference: row.scolapro_reference,
    verificationToken: row.verification_token,
    verificationPath: row.verification_path,
    finalizedAt: row.finalized_at,
    supersedesSnapshotId: row.supersedes_snapshot_id,
    dataSnapshot: row.data_snapshot,
  };
}
