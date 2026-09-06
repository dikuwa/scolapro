export const importDefinitions = {
  learners: {
    label: "Learner",
    columns: ["first_names", "surname", "preferred_name", "date_of_birth", "sex", "national_id", "birth_certificate_number", "academic_year", "grade_code", "class_code", "admission_number", "enrolled_from"],
  },
  staff: {
    label: "Staff",
    columns: ["employee_number", "first_name", "last_name", "assignment_type", "position_title", "effective_from"],
  },
  guardians: {
    label: "Guardian",
    columns: ["learner_admission_number", "identity_number", "first_names", "surname", "preferred_name", "relationship_type", "email", "mobile", "whatsapp", "is_legal_guardian", "is_emergency_contact", "is_pickup_authorized", "priority"],
  },
  academic_structure: {
    label: "Academic structure",
    columns: ["record_type", "code", "display_name", "academic_year", "grade_code"],
  },
} as const;

export type ImportTemplateType = keyof typeof importDefinitions;

export function isImportTemplateType(value: string): value is ImportTemplateType {
  return value in importDefinitions;
}

export function createCsvTemplate(type: ImportTemplateType) {
  return `\uFEFF${importDefinitions[type].columns.join(",")}\r\n`;
}
