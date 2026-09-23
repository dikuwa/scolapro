import type { JSONContent } from "@tiptap/core";

export const CORRESPONDENCE_TEMPLATES = [
  { key: "general_letter", label: "General official letter", subject: "", body: "Please enter the purpose of this correspondence." },
  { key: "circular_notice", label: "Circular / Notice", subject: "NOTICE", body: "Please note the following important information." },
  { key: "vacancy_advertisement", label: "Vacancy advertisement", subject: "VACANCY", body: "Applications are invited for the position described below." },
  { key: "parent_communication", label: "Parent communication", subject: "COMMUNICATION TO PARENTS / GUARDIANS", body: "Dear Parent / Guardian," },
  { key: "request_letter", label: "Request letter", subject: "REQUEST", body: "We respectfully request the following assistance." },
  { key: "invitation", label: "Invitation", subject: "INVITATION", body: "You are hereby invited to attend the event described below." },
  { key: "meeting_notice", label: "Meeting notice", subject: "MEETING NOTICE", body: "Notice is hereby given of the following meeting." },
  { key: "internal_memo", label: "Internal memo", subject: "INTERNAL MEMORANDUM", body: "Please take note of the following internal communication." },
] as const;

export type CorrespondenceTemplateKey = typeof CORRESPONDENCE_TEMPLATES[number]["key"];

export function templateContent(key: CorrespondenceTemplateKey): JSONContent {
  const template = CORRESPONDENCE_TEMPLATES.find((candidate) => candidate.key === key) ?? CORRESPONDENCE_TEMPLATES[0];
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: template.body }] }] };
}
