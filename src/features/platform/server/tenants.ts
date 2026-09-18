import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformSchoolSummary = {
  id: string;
  name: string;
  emisNumber: string | null;
  region: string | null;
  town: string | null;
  status: string;
  physicalAddress: string;
  postalAddress: string;
  telephone: string;
  fax: string;
  schoolEmail: string;
  cellphone: string;
  networkRegionId: string | null;
  networkRegionName: string | null;
  circuitId: string | null;
  circuitName: string | null;
  networkEffectiveFrom: string | null;
};

export type PlatformTenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  schools: PlatformSchoolSummary[];
};

export type PlatformNetworkRegionOption = { value: string; label: string };
export type PlatformNetworkCircuitOption = { value: string; label: string; regionId: string };

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function todayInNamibia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getPlatformTenants(): Promise<PlatformTenantSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id,name,slug,status,schools(id,name,emis_number,region,town,status)")
    .order("name");

  if (error) throw new Error("Unable to load platform tenants.");

  const tenantRows = data ?? [];
  const schoolIds = tenantRows.flatMap((tenant) => (tenant.schools ?? []).map((school) => school.id));
  const profileBySchool = new Map<string, Record<string, unknown>>();
  const assignmentBySchool = new Map<string, { regionId: string; circuitId: string; effectiveFrom: string }>();
  const regionNames = new Map<string, string>();
  const circuitNames = new Map<string, string>();

  if (schoolIds.length) {
    const today = todayInNamibia();
    const [profileResult, assignmentResult] = await Promise.all([
      supabase
        .from("school_settings")
        .select("school_id,setting_value")
        .in("school_id", schoolIds)
        .eq("setting_key", "document_profile"),
      supabase
        .from("school_network_assignments")
        .select("school_id,region_id,circuit_id,effective_from")
        .in("school_id", schoolIds)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`),
    ]);

    if (profileResult.error || assignmentResult.error) {
      throw new Error("Unable to load platform school configuration.");
    }

    for (const row of profileResult.data ?? []) {
      profileBySchool.set(row.school_id, (row.setting_value ?? {}) as Record<string, unknown>);
    }
    for (const row of assignmentResult.data ?? []) {
      assignmentBySchool.set(row.school_id, {
        regionId: row.region_id,
        circuitId: row.circuit_id,
        effectiveFrom: row.effective_from,
      });
    }

    const regionIds = [...new Set([...assignmentBySchool.values()].map((item) => item.regionId))];
    const circuitIds = [...new Set([...assignmentBySchool.values()].map((item) => item.circuitId))];
    const [regionsResult, circuitsResult] = await Promise.all([
      regionIds.length
        ? supabase.from("education_regions").select("id,name").in("id", regionIds)
        : Promise.resolve({ data: [], error: null }),
      circuitIds.length
        ? supabase.from("education_circuits").select("id,name").in("id", circuitIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (regionsResult.error || circuitsResult.error) {
      throw new Error("Unable to resolve platform school network labels.");
    }
    for (const row of regionsResult.data ?? []) regionNames.set(row.id, row.name);
    for (const row of circuitsResult.data ?? []) circuitNames.set(row.id, row.name);
  }

  return tenantRows.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    schools: (tenant.schools ?? []).map((school) => {
      const profile = profileBySchool.get(school.id) ?? {};
      const assignment = assignmentBySchool.get(school.id);
      return {
        id: school.id,
        name: school.name,
        emisNumber: school.emis_number,
        region: school.region,
        town: school.town,
        status: school.status,
        physicalAddress: text(profile.physical_address),
        postalAddress: text(profile.postal_address),
        telephone: text(profile.telephone),
        fax: text(profile.fax),
        schoolEmail: text(profile.email),
        cellphone: text(profile.cellphone),
        networkRegionId: assignment?.regionId ?? null,
        networkRegionName: assignment ? regionNames.get(assignment.regionId) ?? null : null,
        circuitId: assignment?.circuitId ?? null,
        circuitName: assignment ? circuitNames.get(assignment.circuitId) ?? null : null,
        networkEffectiveFrom: assignment?.effectiveFrom ?? null,
      };
    }),
  }));
}

export async function getPlatformNetworkOptions(): Promise<{
  regions: PlatformNetworkRegionOption[];
  circuits: PlatformNetworkCircuitOption[];
}> {
  const supabase = await createSupabaseServerClient();
  const today = todayInNamibia();
  const [regionsResult, circuitsResult, historyResult] = await Promise.all([
    supabase.from("education_regions").select("id,name").order("name"),
    supabase.from("education_circuits").select("id,name").order("name"),
    supabase
      .from("education_circuit_region_history")
      .select("circuit_id,region_id,effective_from,effective_to")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
  ]);

  if (regionsResult.error || circuitsResult.error || historyResult.error) {
    throw new Error("Unable to load education-network configuration options.");
  }

  const regionByCircuit = new Map(
    (historyResult.data ?? []).map((row) => [row.circuit_id, row.region_id] as const),
  );

  return {
    regions: (regionsResult.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    circuits: (circuitsResult.data ?? [])
      .filter((row) => regionByCircuit.has(row.id))
      .map((row) => ({
        value: row.id,
        label: row.name,
        regionId: regionByCircuit.get(row.id)!,
      })),
  };
}
