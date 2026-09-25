import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export type TransferFormSubject = {
  registrationId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  status: string;
};

export type TransferFormSuggestionProvenance = {
  behaviour: JsonRecord[];
  health: JsonRecord[];
  healthAuthorized: boolean;
  otherRelevantInformation: JsonRecord[];
};

export type LearnerTransferFormSource = {
  transferEventId: string;
  transferStatus: string;
  learnerId: string;
  learnerName: string;
  dateOfBirth: string | null;
  sourceEnrolmentId: string;
  academicYear: number;
  presentGrade: string;
  lastGradePassed: string;
  subjects: TransferFormSubject[];
  school: {
    schoolId: string;
    schoolName: string;
    emisNumber: string;
    town: string;
  };
  newSchool: string;
  departureDate: string | null;
  reasonForDeparture: string;
  suggestions: {
    behaviour: string;
    health: string;
    otherRelevantInformation: string;
  };
  suggestionProvenance: TransferFormSuggestionProvenance;
};

export type LearnerTransferFormDraft = {
  id: string;
  reasonForDeparture: string;
  documentsAttached: string;
  behaviourSummary: string;
  healthSummary: string;
  otherRelevantInformation: string;
  verificationNote: string;
  updatedAt: string;
};

export type LearnerTransferFormFinalization = {
  snapshotId: string;
  revision: number;
  status: string;
  scolaproReference: string;
  verificationToken: string;
  verificationPath: string;
  finalizedAt: string;
  dataSnapshot: JsonRecord;
};

export type LearnerTransferFormCandidate = {
  transferEventId: string;
  learnerName: string;
  admissionNumber: string | null;
  transferStatus: string;
  destinationName: string;
  effectiveOn: string | null;
  requestedOn: string;
  latestRevision: number | null;
  latestFinalizedAt: string | null;
};

function parseSource(value: unknown): LearnerTransferFormSource {
  const root = record(value);
  const school = record(root.school);
  const suggestions = record(root.suggestions);
  const provenance = record(root.suggestionProvenance);
  const subjects = Array.isArray(root.subjects) ? root.subjects : [];

  return {
    transferEventId: text(root.transferEventId),
    transferStatus: text(root.transferStatus),
    learnerId: text(root.learnerId),
    learnerName: text(root.learnerName),
    dateOfBirth: root.dateOfBirth ? text(root.dateOfBirth) : null,
    sourceEnrolmentId: text(root.sourceEnrolmentId),
    academicYear: Number(root.academicYear ?? 0),
    presentGrade: text(root.presentGrade),
    lastGradePassed: text(root.lastGradePassed),
    subjects: subjects.map((item) => {
      const row = record(item);
      return {
        registrationId: text(row.registrationId),
        subjectId: text(row.subjectId),
        subjectCode: text(row.subjectCode),
        subjectName: text(row.subjectName),
        status: text(row.status),
      };
    }),
    school: {
      schoolId: text(school.schoolId),
      schoolName: text(school.schoolName),
      emisNumber: text(school.emisNumber),
      town: text(school.town),
    },
    newSchool: text(root.newSchool),
    departureDate: root.departureDate ? text(root.departureDate) : null,
    reasonForDeparture: text(root.reasonForDeparture),
    suggestions: {
      behaviour: text(suggestions.behaviour),
      health: text(suggestions.health),
      otherRelevantInformation: text(suggestions.otherRelevantInformation),
    },
    suggestionProvenance: {
      behaviour: Array.isArray(provenance.behaviour) ? (provenance.behaviour as JsonRecord[]) : [],
      health: Array.isArray(provenance.health) ? (provenance.health as JsonRecord[]) : [],
      healthAuthorized: Boolean(provenance.healthAuthorized),
      otherRelevantInformation: Array.isArray(provenance.otherRelevantInformation)
        ? (provenance.otherRelevantInformation as JsonRecord[])
        : [],
    },
  };
}

export async function getLearnerTransferFormWorkspace(
  transferEventId: string,
): Promise<{
  source: LearnerTransferFormSource;
  draft: LearnerTransferFormDraft | null;
  finalization: LearnerTransferFormFinalization | null;
}> {
  const supabase = await createSupabaseServerClient();
  const [sourceResult, draftResult, finalizationResult] = await Promise.all([
    supabase.rpc("get_learner_transfer_form_source", { p_transfer_event_id: transferEventId }),
    supabase
      .from("learner_transfer_form_drafts")
      .select("id,reason_for_departure,documents_attached,behaviour_summary,health_summary,other_relevant_information,verification_note,updated_at")
      .eq("transfer_event_id", transferEventId)
      .maybeSingle(),
    supabase.rpc("get_learner_transfer_form_finalization", { p_transfer_event_id: transferEventId }),
  ]);

  if (sourceResult.error) throw new Error("Unable to load authoritative transfer-form data.");
  if (draftResult.error) throw new Error("Unable to load the transfer-form draft.");
  if (finalizationResult.error) throw new Error("Unable to load finalized transfer-form provenance.");

  const draftRow = draftResult.data;
  const finalRow = (Array.isArray(finalizationResult.data) ? finalizationResult.data[0] : finalizationResult.data) as
    | JsonRecord
    | undefined;

  return {
    source: parseSource(sourceResult.data),
    draft: draftRow
      ? {
          id: String(draftRow.id),
          reasonForDeparture: draftRow.reason_for_departure ?? "",
          documentsAttached: draftRow.documents_attached ?? "",
          behaviourSummary: draftRow.behaviour_summary ?? "",
          healthSummary: draftRow.health_summary ?? "",
          otherRelevantInformation: draftRow.other_relevant_information ?? "",
          verificationNote: draftRow.verification_note ?? "",
          updatedAt: draftRow.updated_at,
        }
      : null,
    finalization: finalRow
      ? {
          snapshotId: text(finalRow.snapshot_id),
          revision: Number(finalRow.revision ?? 0),
          status: text(finalRow.status),
          scolaproReference: text(finalRow.scolapro_reference),
          verificationToken: text(finalRow.verification_token),
          verificationPath: text(finalRow.verification_path),
          finalizedAt: text(finalRow.finalized_at),
          dataSnapshot: record(finalRow.data_snapshot),
        }
      : null,
  };
}

export async function listLearnerTransferFormCandidates(): Promise<LearnerTransferFormCandidate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_learner_transfer_form_candidates");
  if (error) throw new Error("Unable to load learner transfer forms.");

  return ((data ?? []) as JsonRecord[]).map((row) => ({
    transferEventId: text(row.transfer_event_id),
    learnerName: text(row.learner_name),
    admissionNumber: row.admission_number ? text(row.admission_number) : null,
    transferStatus: text(row.transfer_status),
    destinationName: text(row.destination_name),
    effectiveOn: row.effective_on ? text(row.effective_on) : null,
    requestedOn: text(row.requested_on),
    latestRevision: row.latest_revision == null ? null : Number(row.latest_revision),
    latestFinalizedAt: row.latest_finalized_at ? text(row.latest_finalized_at) : null,
  }));
}

export async function getLearnerTransferFormSnapshot(snapshotId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learner_transfer_form_snapshots")
    .select("id,revision,status,data_snapshot,finalized_at,transfer_event_id")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error || !data) throw new Error("Learner transfer-form snapshot not found.");
  return {
    snapshotId: data.id,
    revision: data.revision,
    status: data.status,
    finalizedAt: data.finalized_at,
    transferEventId: data.transfer_event_id,
    dataSnapshot: record(data.data_snapshot),
  };
}
