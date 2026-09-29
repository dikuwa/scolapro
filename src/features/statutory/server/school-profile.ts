import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

export type SchoolStatutoryEmisProfile = {
  school: {
    id: string;
    name: string;
    emisNumber: string;
    town: string;
  };
  network: {
    regionName: string;
    circuitName: string;
    clusterName: string;
  };
  contact: {
    physicalAddress: string;
    postalAddress: string;
    telephone: string;
    email: string;
    cellphone: string;
  };
  hostel: {
    configured: boolean;
    activeCount: number;
    types: string[];
  };
  profile: {
    payPoint: string;
    constituency: string;
    schoolClassification: string;
    ownership: string;
    urbanRural: string;
    isSatelliteSchool: boolean;
    satelliteSchoolInformation: string;
    isClusterCentre: boolean;
  };
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function bool(value: unknown): boolean {
  return value === true;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export async function getSchoolStatutoryEmisProfile(schoolId: string): Promise<SchoolStatutoryEmisProfile> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_school_statutory_emis_profile", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load the school's Statutory / EMIS Profile.");

  const root = record(data);
  const school = record(root.school);
  const network = record(root.network);
  const contact = record(root.contact);
  const hostel = record(root.hostel);
  const profile = record(root.profile);

  return {
    school: {
      id: text(school.id),
      name: text(school.name),
      emisNumber: text(school.emis_number),
      town: text(school.town),
    },
    network: {
      regionName: text(network.region_name),
      circuitName: text(network.circuit_name),
      clusterName: text(network.cluster_name),
    },
    contact: {
      physicalAddress: text(contact.physical_address),
      postalAddress: text(contact.postal_address),
      telephone: text(contact.telephone),
      email: text(contact.email),
      cellphone: text(contact.cellphone),
    },
    hostel: {
      configured: bool(hostel.configured),
      activeCount: integer(hostel.active_count),
      types: Array.isArray(hostel.types) ? hostel.types.map(text).filter(Boolean) : [],
    },
    profile: {
      payPoint: text(profile.pay_point),
      constituency: text(profile.constituency),
      schoolClassification: text(profile.school_classification),
      ownership: text(profile.ownership),
      urbanRural: text(profile.urban_rural),
      isSatelliteSchool: bool(profile.is_satellite_school),
      satelliteSchoolInformation: text(profile.satellite_school_information),
      isClusterCentre: bool(profile.is_cluster_centre),
    },
  };
}
