import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformSchoolSummary = {
  id: string;
  name: string;
  emisNumber: string | null;
  region: string | null;
  town: string | null;
  status: string;
};

export type PlatformTenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  schools: PlatformSchoolSummary[];
};

export async function getPlatformTenants(): Promise<PlatformTenantSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id,name,slug,status,schools(id,name,emis_number,region,town,status)")
    .order("name");

  if (error) {
    throw new Error("Unable to load platform tenants.");
  }

  return (data ?? []).map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    schools: (tenant.schools ?? []).map((school) => ({
      id: school.id,
      name: school.name,
      emisNumber: school.emis_number,
      region: school.region,
      town: school.town,
      status: school.status,
    })),
  }));
}