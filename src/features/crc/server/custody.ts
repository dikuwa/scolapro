import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrcCustodyRecord = {
  custodyId: string;
  custodyStatus: string;
  learnerName: string;
  admissionNumber: string | null;
  originSchoolName: string;
  receivingSchoolName: string;
  receivingUserName: string;
  custodyNote: string | null;
  preparedAt: string;
  updatedAt: string;
  outgoing: boolean;
  incoming: boolean;
};

export type CrcCustodyDestination = {
  schoolId: string;
  schoolName: string;
  schoolTown: string | null;
};

export type CrcCustodyReceiver = {
  userId: string;
  displayName: string;
  roleKey: string;
};

export type CrcCustodyLearner = {
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeLabel: string | null;
};

type RpcRow = Record<string, unknown>;

function rpcRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export async function getMyCrcCustodyRecords(): Promise<CrcCustodyRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_crc_custody_records");
  if (error) throw new Error("Unable to load CRC custody records.");
  return rpcRows<RpcRow>(data).map((row) => ({
    custodyId: String(row.custody_id),
    custodyStatus: String(row.custody_status),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    originSchoolName: String(row.origin_school_name ?? "School"),
    receivingSchoolName: String(row.receiving_school_name ?? "School"),
    receivingUserName: String(row.receiving_user_name ?? "Custodian"),
    custodyNote: row.custody_note ? String(row.custody_note) : null,
    preparedAt: String(row.prepared_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    outgoing: Boolean(row.outgoing),
    incoming: Boolean(row.incoming),
  }));
}

export async function getCrcCustodyDestinations(): Promise<CrcCustodyDestination[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_custody_destination_schools");
  if (error) throw new Error("Unable to load CRC custody destinations.");
  return rpcRows<RpcRow>(data).map((row) => ({
    schoolId: String(row.school_id),
    schoolName: String(row.school_name),
    schoolTown: row.school_town ? String(row.school_town) : null,
  }));
}

export async function searchCrcCustodyLearners(query: string): Promise<CrcCustodyLearner[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_crc_custody_learners", { p_query: query });
  if (error) throw new Error("Unable to search learners for custody.");
  return rpcRows<RpcRow>(data).map((row) => ({
    learnerId: String(row.learner_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    gradeLabel: row.grade_label ? String(row.grade_label) : null,
  }));
}

export async function searchCrcCustodyReceivers(schoolId: string): Promise<CrcCustodyReceiver[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_crc_custody_receivers", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load receiving custodians.");
  return rpcRows<RpcRow>(data).map((row) => ({
    userId: String(row.user_id),
    displayName: String(row.display_name ?? "Custodian"),
    roleKey: String(row.role_key ?? ""),
  }));
}

export type CrcContributionContext = {
  enrolmentId: string;
  learnerId: string;
  schoolId: string;
  academicYear: number;
  gradeLabel: string;
  registerClassLabel: string;
};

export type CrcAdministrationSummary = {
  academicYear: number;
  currentLearners: number;
  learnersWithRoutineCrcActivity: number;
  learnersWithoutRoutineCrcActivity: number;
  outgoingTransfers: number;
  incomingTransfers: number;
  requestsAwaitingAction: number;
  incomingAwaitingAcknowledgement: number;
  canViewConfidentialSupport: boolean;
  leadershipOversight: boolean;
  canManageCustody?: boolean;
};

export type CrcCustodyAccessContext = {
  canManageCustody: boolean;
  canViewConfidentialSupport: boolean;
  leadership: boolean;
};

export type CrcCustodyRequest = {
  requestId: string;
  learnerName: string;
  admissionNumber: string | null;
  receivingSchoolName: string;
  originSchoolName: string;
  status: string;
  requestedOn: string;
  responseDueOn: string;
  overdue: boolean;
  requestNote: string | null;
  custodyRecordId: string | null;
  incoming: boolean;
  outgoing: boolean;
  externalOrigin: boolean;
};

export type CrcClassCompleteness = {
  registerClassId: string;
  registerClassLabel: string;
  gradeLabel: string;
  learnerCount: number;
  contributedCount: number;
  followUpCount: number;
};

export type CrcAdministrationLearner = {
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  gradeId: string;
  gradeLabel: string;
  registerClassId: string;
  registerClassLabel: string;
  routineActivity: boolean;
  openRequest: boolean;
  overdueRequest: boolean;
  missingIncoming: boolean;
  temporaryCrc: boolean;
  outgoingTransfer: boolean;
  awaitingAcknowledgement: boolean;
  readinessStatus: "complete" | "incomplete" | "temporary" | "missing_incoming";
};

export type CrcTransferRegisterRow = {
  registerKey: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  direction: "incoming" | "outgoing";
  counterpartSchoolName: string;
  transferStatus: string | null;
  custodyStatus: string | null;
  requestedOn: string | null;
  effectiveOn: string | null;
  dispatchedAt: string | null;
  acknowledgedAt: string | null;
  closedAt: string | null;
  documentCount: number;
  transferEventId: string | null;
  custodyId: string | null;
};

export type CrcAdministrationDocument = {
  documentId: string;
  custodyId: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  direction: "incoming" | "outgoing";
  custodyStatus: string;
  fileName: string;
  mimeType: string | null;
  createdAt: string;
};

export async function getMyCrcContributionContext(
  learnerId: string,
  schoolId: string,
): Promise<CrcContributionContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_crc_contribution_context", {
    p_learner_id: learnerId,
    p_school_id: schoolId,
  });
  if (error) throw new Error("Unable to resolve routine CRC contribution authority.");
  const row = ((data ?? []) as RpcRow[])[0];
  if (!row) return null;
  return {
    enrolmentId: String(row.enrolment_id),
    learnerId: String(row.learner_id),
    schoolId: String(row.school_id),
    academicYear: Number(row.academic_year),
    gradeLabel: String(row.grade_label ?? ""),
    registerClassLabel: String(row.register_class_label ?? ""),
  };
}

export async function getCrcAdministrationSummary(
  schoolId: string,
): Promise<{ summary: CrcAdministrationSummary; classes: CrcClassCompleteness[] }> {
  const supabase = await createSupabaseServerClient();
  const [summaryResult, classesResult] = await Promise.all([
    supabase.rpc("get_crc_administration_summary", { p_school_id: schoolId }),
    supabase.rpc("list_crc_class_completeness", { p_school_id: schoolId }),
  ]);
  if (summaryResult.error || classesResult.error) {
    throw new Error("Unable to load CRC administration readiness.");
  }

  const raw = (summaryResult.data ?? {}) as Record<string, unknown>;
  const summary: CrcAdministrationSummary = {
    academicYear: Number(raw.academic_year ?? new Date().getFullYear()),
    currentLearners: Number(raw.current_learners ?? 0),
    learnersWithRoutineCrcActivity: Number(raw.learners_with_routine_crc_activity ?? 0),
    learnersWithoutRoutineCrcActivity: Number(raw.learners_without_routine_crc_activity ?? 0),
    outgoingTransfers: Number(raw.outgoing_transfers ?? 0),
    incomingTransfers: Number(raw.incoming_transfers ?? 0),
    requestsAwaitingAction: Number(raw.requests_awaiting_action ?? 0),
    incomingAwaitingAcknowledgement: Number(raw.incoming_awaiting_acknowledgement ?? 0),
    canViewConfidentialSupport: Boolean(raw.can_view_confidential_support),
    leadershipOversight: Boolean(raw.leadership_oversight),
    canManageCustody: Boolean(raw.can_manage_custody),
  };

  const classes: CrcClassCompleteness[] = ((classesResult.data ?? []) as RpcRow[]).map((row) => ({
    registerClassId: String(row.register_class_id),
    registerClassLabel: String(row.register_class_label ?? "Class"),
    gradeLabel: String(row.grade_label ?? "Grade"),
    learnerCount: Number(row.learner_count ?? 0),
    contributedCount: Number(row.contributed_count ?? 0),
    followUpCount: Number(row.follow_up_count ?? 0),
  }));

  return { summary, classes };
}


export async function getCrcCustodyAccessContext(
  schoolId: string,
): Promise<CrcCustodyAccessContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_crc_custody_access_context", {
    p_school_id: schoolId,
  });
  if (error) throw new Error("Unable to resolve CRC custody authority.");
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    canManageCustody: Boolean(row.can_manage_custody),
    canViewConfidentialSupport: Boolean(row.can_view_confidential_support),
    leadership: Boolean(row.leadership),
  };
}

export async function getMyCrcCustodyRequests(): Promise<CrcCustodyRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_crc_custody_requests");
  if (error) throw new Error("Unable to load CRC custody requests.");
  return rpcRows<RpcRow>(data).map((row) => ({
    requestId: String(row.request_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    receivingSchoolName: String(row.receiving_school_name ?? "School"),
    originSchoolName: String(row.origin_school_name ?? "School"),
    status: String(row.status ?? "requested"),
    requestedOn: String(row.requested_on ?? ""),
    responseDueOn: String(row.response_due_on ?? ""),
    overdue: Boolean(row.overdue),
    requestNote: row.request_note ? String(row.request_note) : null,
    custodyRecordId: row.custody_record_id ? String(row.custody_record_id) : null,
    incoming: Boolean(row.incoming),
    outgoing: Boolean(row.outgoing),
    externalOrigin: Boolean(row.external_origin),
  }));
}


export type CrcRequestOrigin = {
  schoolId: string;
  schoolName: string;
  schoolTown: string | null;
  lastEnrolledOn: string;
};

export type CrcNetworkEscalation = {
  escalationId: string;
  requestId: string;
  scopeKind: "circuit" | "region";
  receivingSchoolName: string;
  originSchoolName: string;
  responseDueOn: string;
  requestStatus: string;
  escalationStatus: string;
  escalatedAt: string;
};

export async function listCrcRequestOrigins(
  learnerId: string,
): Promise<CrcRequestOrigin[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_request_origins", {
    p_learner_id: learnerId,
  });
  if (error) throw new Error("Unable to load the learner's prior schools.");
  return rpcRows<RpcRow>(data).map((row) => ({
    schoolId: String(row.school_id),
    schoolName: String(row.school_name ?? "School"),
    schoolTown: row.school_town ? String(row.school_town) : null,
    lastEnrolledOn: String(row.last_enrolled_on ?? ""),
  }));
}

export async function getCrcCustodyRequestPolicy(
  schoolId: string,
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_crc_custody_request_policy", {
    p_school_id: schoolId,
  });
  if (error) throw new Error("Unable to load CRC request policy.");
  return Number(data ?? 7);
}

export async function getMyCrcRequestEscalations(): Promise<CrcNetworkEscalation[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_crc_request_escalations");
  if (error) throw new Error("Unable to load CRC request escalations.");
  return rpcRows<RpcRow>(data).map((row) => ({
    escalationId: String(row.escalation_id),
    requestId: String(row.request_id),
    scopeKind: String(row.scope_kind) as "circuit" | "region",
    receivingSchoolName: String(row.receiving_school_name ?? "School"),
    originSchoolName: String(row.origin_school_name ?? "School"),
    responseDueOn: String(row.response_due_on ?? ""),
    requestStatus: String(row.request_status ?? "requested"),
    escalationStatus: String(row.escalation_status ?? "open"),
    escalatedAt: String(row.escalated_at ?? ""),
  }));
}


export async function listCrcAdministrationLearners(schoolId: string): Promise<CrcAdministrationLearner[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_administration_learners", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load CRC learner readiness.");
  return rpcRows<RpcRow>(data).map((row) => ({
    learnerId: String(row.learner_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    gradeId: String(row.grade_id),
    gradeLabel: String(row.grade_label ?? "Grade"),
    registerClassId: String(row.register_class_id),
    registerClassLabel: String(row.register_class_label ?? "Class"),
    routineActivity: Boolean(row.routine_activity),
    openRequest: Boolean(row.open_request),
    overdueRequest: Boolean(row.overdue_request),
    missingIncoming: Boolean(row.missing_incoming),
    temporaryCrc: Boolean(row.temporary_crc),
    outgoingTransfer: Boolean(row.outgoing_transfer),
    awaitingAcknowledgement: Boolean(row.awaiting_acknowledgement),
    readinessStatus: String(row.readiness_status) as CrcAdministrationLearner["readinessStatus"],
  }));
}

export async function listCrcTransferRegister(schoolId: string): Promise<CrcTransferRegisterRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_transfer_register", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load the CRC transfer register.");
  return rpcRows<RpcRow>(data).map((row) => ({
    registerKey: String(row.register_key),
    learnerId: String(row.learner_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    direction: String(row.direction) as CrcTransferRegisterRow["direction"],
    counterpartSchoolName: String(row.counterpart_school_name ?? "School"),
    transferStatus: row.transfer_status ? String(row.transfer_status) : null,
    custodyStatus: row.custody_status ? String(row.custody_status) : null,
    requestedOn: row.requested_on ? String(row.requested_on) : null,
    effectiveOn: row.effective_on ? String(row.effective_on) : null,
    dispatchedAt: row.dispatched_at ? String(row.dispatched_at) : null,
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
    documentCount: Number(row.document_count ?? 0),
    transferEventId: row.transfer_event_id ? String(row.transfer_event_id) : null,
    custodyId: row.custody_id ? String(row.custody_id) : null,
  }));
}

export async function listCrcAdministrationDocuments(schoolId: string): Promise<CrcAdministrationDocument[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_administration_documents", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load CRC document metadata.");
  return rpcRows<RpcRow>(data).map((row) => ({
    documentId: String(row.document_id),
    custodyId: String(row.custody_id),
    learnerId: String(row.learner_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    direction: String(row.direction) as CrcAdministrationDocument["direction"],
    custodyStatus: String(row.custody_status ?? ""),
    fileName: String(row.file_name ?? "CRC document"),
    mimeType: row.mime_type ? String(row.mime_type) : null,
    createdAt: String(row.created_at ?? ""),
  }));
}


export type CrcTransferHandoffRequirement = {
  transferEventId: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  destinationSchoolId: string | null;
  destinationName: string;
  effectiveOn: string | null;
  handoffStatus: "pending" | "external_required";
};

export async function listCrcTransferHandoffRequirements(schoolId: string): Promise<CrcTransferHandoffRequirement[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_crc_transfer_handoff_requirements", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load CRC transfer handoff requirements.");
  return rpcRows<RpcRow>(data).map((row) => ({
    transferEventId: String(row.transfer_event_id),
    learnerId: String(row.learner_id),
    learnerName: String(row.learner_name ?? "Learner"),
    admissionNumber: row.admission_number ? String(row.admission_number) : null,
    destinationSchoolId: row.destination_school_id ? String(row.destination_school_id) : null,
    destinationName: String(row.destination_name ?? "Destination school"),
    effectiveOn: row.effective_on ? String(row.effective_on) : null,
    handoffStatus: String(row.handoff_status) as CrcTransferHandoffRequirement["handoffStatus"],
  }));
}
