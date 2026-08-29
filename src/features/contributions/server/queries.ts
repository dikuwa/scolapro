import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContributionCampaign = {
  id: string;
  title: string;
  description: string | null;
  academicYear: number;
  startsOn: string;
  endsOn: string | null;
  status: string;
  itemCount: number;
};

export type ContributionItem = {
  id: string;
  campaignId: string;
  label: string;
  itemType: string;
  description: string | null;
  unitLabel: string | null;
  suggestedQuantity: number | null;
  suggestedAmount: number | null;
  currency: string;
};

export type LearnerContribution = {
  id: string;
  learnerId: string;
  learnerName: string;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
  campaignTitle: string;
  itemLabel: string;
  itemType: string;
  quantity: number | null;
  amount: number | null;
  currency: string;
  note: string | null;
  contributionDate: string;
  receivedByName: string | null;
  status: string;
};

export async function getContributionWorkspace(schoolId: string, academicYear: number) {
  const supabase = await createSupabaseServerClient();

  // Fetch campaigns
  const { data: campaigns } = await supabase
    .from("voluntary_contribution_campaigns")
    .select("id, title, description, academic_year, starts_on, ends_on, status")
    .eq("school_id", schoolId)
    .eq("academic_year", academicYear)
    .order("starts_on", { ascending: false });

  const campaignList: ContributionCampaign[] = (campaigns ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    academicYear: c.academic_year,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    status: c.status,
    itemCount: 0,
  }));

  // Fetch items for all campaigns
  const campaignIds = campaignList.map((c) => c.id);
  const items: ContributionItem[] = [];
  if (campaignIds.length) {
    const { data: itemData } = await supabase
      .from("voluntary_contribution_items")
      .select("id, campaign_id, label, item_type, description, unit_label, suggested_quantity, suggested_amount, currency")
      .in("campaign_id", campaignIds)
      .eq("active", true)
      .order("sort_order");

    for (const row of itemData ?? []) {
      items.push({
        id: row.id,
        campaignId: row.campaign_id,
        label: row.label,
        itemType: row.item_type,
        description: row.description,
        unitLabel: row.unit_label,
        suggestedQuantity: row.suggested_quantity,
        suggestedAmount: row.suggested_amount,
        currency: row.currency ?? "NAD",
      });
    }

    // Update item counts
    for (const campaign of campaignList) {
      campaign.itemCount = items.filter((i) => i.campaignId === campaign.id).length;
    }
  }

  // Fetch recent contributions with learner info
  const contributions: LearnerContribution[] = [];
  if (campaignIds.length) {
    const { data: contribData } = await supabase
      .from("learner_voluntary_contributions")
      .select(`
        id, learner_id, item_id, quantity, amount, note, contribution_date, status,
        learners!inner(id, first_names, surname),
        voluntary_contribution_items!inner(label, item_type, currency, campaign_id),
        voluntary_contribution_campaigns!inner(title)
      `)
      .in("campaign_id", campaignIds)
      .order("contribution_date", { ascending: false })
      .limit(200);

    for (const row of contribData ?? []) {
      const learner = Array.isArray(row.learners) ? row.learners[0] : row.learners;
      const item = Array.isArray(row.voluntary_contribution_items) ? row.voluntary_contribution_items[0] : row.voluntary_contribution_items;
      const campaign = Array.isArray(row.voluntary_contribution_campaigns) ? row.voluntary_contribution_campaigns[0] : row.voluntary_contribution_campaigns;
      if (!learner || !item) continue;

      contributions.push({
        id: row.id,
        learnerId: row.learner_id,
        learnerName: learner ? `${learner.first_names} ${learner.surname}` : "Unknown",
        admissionNumber: null,
        grade: "",
        registerClass: "",
        campaignTitle: campaign?.title ?? "",
        itemLabel: item.label,
        itemType: item.item_type,
        quantity: row.quantity,
        amount: row.amount,
        currency: item.currency ?? "NAD",
        note: row.note,
        contributionDate: row.contribution_date,
        receivedByName: null,
        status: row.status,
      });
    }
  }

  return { campaigns: campaignList, items, contributions };
}
