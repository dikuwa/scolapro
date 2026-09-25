export const SCHOOL_DUTY_CAPABILITIES = {
  late_arrival_recorder: {
    label: "Late-arrival recorder",
    description: "Record school morning late arrivals and work the delegated late-arrival queue while the assignment is effective.",
    navigationKey: "late_arrivals",
  },
} as const;

export type SchoolDutyKey = keyof typeof SCHOOL_DUTY_CAPABILITIES;

export function navigationKeyForSchoolDuty(dutyKey: string): string | null {
  return dutyKey in SCHOOL_DUTY_CAPABILITIES
    ? SCHOOL_DUTY_CAPABILITIES[dutyKey as SchoolDutyKey].navigationKey
    : null;
}
