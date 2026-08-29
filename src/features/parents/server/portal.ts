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

export type ParentReportDocument = {
  id: string;
  snapshotId: string;
  documentFormat: string;
  generatedAt: string;
};

export type ParentInvoice = {
  invoiceId: string;
  learnerId: string;
  academicYear: number;
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string | null;
  status: string;
  currency: string;
  totalAmount: number;
  balanceAmount: number;
};

export type ParentPayment = {
  paymentId: string;
  learnerId: string;
  paymentReference: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  paidOn: string;
  status: string;
};

export type ParentMessage = {
  recipientId: string;
  messageId: string;
  schoolId: string;
  schoolName: string;
  channel: string;
  subject: string | null;
  body: string;
  sensitive: boolean;
  sentAt: string | null;
  deliveredAt: string | null;
};

export type ClaimableGuardianProfile = {
  guardianId: string;
  tenantId: string;
  displayName: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getParentPortalData() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: overviewData, error: overviewError },
    { data: financeData, error: financeError },
    { data: messageData, error: messageError },
  ] = await Promise.all([
    supabase.rpc("get_parent_family_overview"),
    supabase.rpc("get_parent_finance_overview"),
    supabase.rpc("get_parent_message_overview", { p_limit: 50 }),
  ]);
  if (overviewError) throw new Error("Unable to load your family overview.");
  if (financeError) throw new Error("Unable to load your family finance overview.");
  if (messageError) throw new Error("Unable to load your messages.");

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

  const documents: ParentReportDocument[] = [];
  const reportIds = reports.map((report) => report.id);
  if (reportIds.length) {
    const { data, error } = await supabase
      .from("report_card_documents")
      .select("id,snapshot_id,document_format,generated_at")
      .in("snapshot_id", reportIds)
      .eq("status", "ready")
      .order("generated_at", { ascending: false });
    if (error) throw new Error("Unable to load published report documents.");
    for (const row of data ?? []) {
      documents.push({
        id: row.id,
        snapshotId: row.snapshot_id,
        documentFormat: row.document_format,
        generatedAt: row.generated_at,
      });
    }
  }

  const finance = record(financeData);
  const invoices: ParentInvoice[] = (Array.isArray(finance.invoices) ? finance.invoices : []).map((value) => {
    const row = record(value);
    return {
      invoiceId: String(row.invoice_id ?? ""),
      learnerId: String(row.learner_id ?? ""),
      academicYear: numberValue(row.academic_year),
      invoiceNumber: String(row.invoice_number ?? ""),
      issuedOn: String(row.issued_on ?? ""),
      dueOn: row.due_on ? String(row.due_on) : null,
      status: String(row.status ?? "issued"),
      currency: String(row.currency ?? "NAD"),
      totalAmount: numberValue(row.total_amount),
      balanceAmount: numberValue(row.balance_amount),
    };
  }).filter((row) => row.invoiceId && row.learnerId);

  const payments: ParentPayment[] = (Array.isArray(finance.payments) ? finance.payments : []).map((value) => {
    const row = record(value);
    return {
      paymentId: String(row.payment_id ?? ""),
      learnerId: String(row.learner_id ?? ""),
      paymentReference: String(row.payment_reference ?? ""),
      paymentMethod: String(row.payment_method ?? "other"),
      amount: numberValue(row.amount),
      currency: String(row.currency ?? "NAD"),
      paidOn: String(row.paid_on ?? ""),
      status: String(row.status ?? "received"),
    };
  }).filter((row) => row.paymentId && row.learnerId);

  const messages: ParentMessage[] = (messageData ?? []).map((row: {
    recipient_id: string;
    message_id: string;
    school_id: string;
    school_name: string;
    channel: string;
    subject: string | null;
    body: string;
    sensitive: boolean;
    sent_at: string | null;
    delivered_at: string | null;
  }) => ({
    recipientId: row.recipient_id,
    messageId: row.message_id,
    schoolId: row.school_id,
    schoolName: row.school_name,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    sensitive: row.sensitive,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
  }));

  const { data: claimableData, error: claimableError } = await supabase.rpc("find_claimable_guardian_profiles");
  if (claimableError) throw new Error("Unable to check guardian-account matches.");
  const claimable: ClaimableGuardianProfile[] = (claimableData ?? []).map((row: { guardian_id: string; tenant_id: string; display_name: string }) => ({
    guardianId: row.guardian_id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
  }));

  return { children, reports, documents, invoices, payments, messages, claimable };
}
