import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContributionCampaign = { id: string; academicYear: number; title: string; description: string | null; startsOn: string; endsOn: string | null; status: string; visibleToGuardians: boolean };
export type ContributionItem = { id: string; campaignId: string; type: string; label: string; description: string | null; unitLabel: string | null; suggestedQuantity: number | null; suggestedAmount: number | null; active: boolean };
export type ContributionLearner = { id: string; name: string; admissionNumber: string | null; grade: string; registerClass: string };
export type ContributionStaff = { id: string; name: string };
export type ContributionRecord = { id: string; learnerId: string; campaignId: string; itemId: string; date: string; quantity: number | null; amount: number | null; note: string | null; receivedByStaffId: string | null; status: string };

export async function getContributionWorkspace(schoolId: string) {
  const supabase = await createSupabaseServerClient();
  const [campaignResult, enrolmentResult, staffAssignmentResult] = await Promise.all([
    supabase.from("voluntary_contribution_campaigns").select("id,academic_year,title,description,starts_on,ends_on,status,visible_to_guardians").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    supabase.from("enrolments").select("learner_id,admission_number,grade_id,register_class_id").eq("school_id", schoolId).eq("status", "current"),
    supabase.from("staff_school_assignments").select("staff_member_id,effective_from,effective_to").eq("school_id", schoolId).lte("effective_from", new Date().toISOString().slice(0, 10)).or(`effective_to.is.null,effective_to.gte.${new Date().toISOString().slice(0, 10)}`),
  ]);
  if (campaignResult.error || enrolmentResult.error || staffAssignmentResult.error) throw new Error("Unable to load the contributions workspace.");

  const campaignIds = (campaignResult.data ?? []).map((item) => item.id);
  const learnerIds = Array.from(new Set((enrolmentResult.data ?? []).map((item) => item.learner_id)));
  const staffIds = Array.from(new Set((staffAssignmentResult.data ?? []).map((item) => item.staff_member_id)));
  const gradeIds = Array.from(new Set((enrolmentResult.data ?? []).map((item) => item.grade_id).filter(Boolean)));
  const classIds = Array.from(new Set((enrolmentResult.data ?? []).map((item) => item.register_class_id).filter(Boolean)));

  const [itemsResult, recordsResult, learnersResult, staffResult, gradesResult, classesResult] = await Promise.all([
    campaignIds.length ? supabase.from("voluntary_contribution_items").select("id,campaign_id,item_type,label,description,unit_label,suggested_quantity,suggested_amount,active").in("campaign_id", campaignIds).order("sort_order") : Promise.resolve({ data: [], error: null }),
    supabase.from("learner_voluntary_contributions").select("id,learner_id,campaign_id,item_id,contribution_date,quantity,amount,note,received_by_staff_member_id,status").eq("school_id", schoolId).order("contribution_date", { ascending: false }).limit(1000),
    learnerIds.length ? supabase.from("learners").select("id,first_names,surname,preferred_name").in("id", learnerIds) : Promise.resolve({ data: [], error: null }),
    staffIds.length ? supabase.from("staff_members").select("id,first_name,last_name").in("id", staffIds).eq("status", "active") : Promise.resolve({ data: [], error: null }),
    gradeIds.length ? supabase.from("grades").select("id,display_name").in("id", gradeIds) : Promise.resolve({ data: [], error: null }),
    classIds.length ? supabase.from("register_classes").select("id,display_name").in("id", classIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error || recordsResult.error || learnersResult.error || staffResult.error || gradesResult.error || classesResult.error) throw new Error("Unable to load contribution details.");

  const learnerMap = new Map((learnersResult.data ?? []).map((item) => [item.id, item]));
  const gradeMap = new Map((gradesResult.data ?? []).map((item) => [item.id, item.display_name]));
  const classMap = new Map((classesResult.data ?? []).map((item) => [item.id, item.display_name]));
  const campaigns: ContributionCampaign[] = (campaignResult.data ?? []).map((item) => ({ id: item.id, academicYear: item.academic_year, title: item.title, description: item.description, startsOn: item.starts_on, endsOn: item.ends_on, status: item.status, visibleToGuardians: item.visible_to_guardians }));
  const items: ContributionItem[] = (itemsResult.data ?? []).map((item) => ({ id: item.id, campaignId: item.campaign_id, type: item.item_type, label: item.label, description: item.description, unitLabel: item.unit_label, suggestedQuantity: item.suggested_quantity, suggestedAmount: item.suggested_amount, active: item.active }));
  const learners: ContributionLearner[] = (enrolmentResult.data ?? []).map((enrolment) => {
    const learner = learnerMap.get(enrolment.learner_id);
    return { id: enrolment.learner_id, name: learner ? [learner.preferred_name || learner.first_names, learner.surname].filter(Boolean).join(" ") : "Learner", admissionNumber: enrolment.admission_number, grade: gradeMap.get(enrolment.grade_id) ?? "Grade not set", registerClass: classMap.get(enrolment.register_class_id) ?? "Class not set" };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const staff: ContributionStaff[] = (staffResult.data ?? []).map((item) => ({ id: item.id, name: [item.first_name, item.last_name].filter(Boolean).join(" ") })).sort((a, b) => a.name.localeCompare(b.name));
  const records: ContributionRecord[] = (recordsResult.data ?? []).map((item) => ({ id: item.id, learnerId: item.learner_id, campaignId: item.campaign_id, itemId: item.item_id, date: item.contribution_date, quantity: item.quantity, amount: item.amount, note: item.note, receivedByStaffId: item.received_by_staff_member_id, status: item.status }));
  return { campaigns, items, learners, staff, records };
}
