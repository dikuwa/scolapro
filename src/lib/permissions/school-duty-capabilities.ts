export const SCHOOL_DUTY_CAPABILITIES = {
  late_arrival_recorder: {
    label: "Late-arrival recorder",
    description: "Record school morning late arrivals and work the delegated late-arrival queue while the assignment is effective.",
    navigationKey: "late_arrivals",
  },
  crc_custodian: {
    label: "CRC custodian",
    description: "Manage governed CRC requests and custody transfers while the delegation is effective. This does not grant counselling or psychometric access.",
    navigationKey: "crc_custody",
  },
} as const;

export type SchoolDutyKey = keyof typeof SCHOOL_DUTY_CAPABILITIES;

export function navigationKeyForSchoolDuty(dutyKey: string): string | null {
  return dutyKey in SCHOOL_DUTY_CAPABILITIES
    ? SCHOOL_DUTY_CAPABILITIES[dutyKey as SchoolDutyKey].navigationKey
    : null;
}
