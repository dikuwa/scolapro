// Shared test harness for the register-teacher document.
//
// Registers a test-only loader that can import the real `server-only`
// TypeScript render/aggregation modules, then re-exports them. This lets tests
// exercise the actual renderers and builder instead of asserting against source
// text.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tests/helpers/ts-server-loader.mjs", pathToFileURL(`${process.cwd()}/`).href);

export const layout = await import("@/features/attendance/server/register-teacher-layout.ts");
export const model = await import("@/features/attendance/server/register-teacher-document.ts");
export const htmlRenderer = await import("@/features/attendance/server/render-register-teacher-html.ts");
export const pdfRenderer = await import("@/features/attendance/server/render-register-teacher-pdf.ts");

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekdaysBetween(start, end) {
  const dates = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    const day = new Date(`${current}T12:00:00Z`).getUTCDay();
    if (day >= 1 && day <= 5) dates.push(current);
  }
  return dates;
}

/** Governed teaching-impact rows: NORMAL for every weekday in the range. */
export function normalImpactRows(start, end) {
  return weekdaysBetween(start, end).map((target_date) => ({ target_date, teaching_impact: "NORMAL" }));
}

export function learnerRow(overrides) {
  return {
    id: overrides.id,
    learner_id: overrides.learner_id ?? overrides.id,
    admission_number: overrides.admission_number ?? null,
    enrolled_from: overrides.enrolled_from ?? "2026-01-12",
    enrolled_to: overrides.enrolled_to ?? null,
    learners: {
      first_names: overrides.first_names ?? "Fixture",
      surname: overrides.surname ?? "Learner",
      date_of_birth: overrides.date_of_birth ?? "2014-01-01",
      sex: overrides.sex ?? "male",
    },
  };
}

export const HEADER_FIXTURE = Object.freeze({
  mode: "internal_school",
  schoolName: "Fixture Secondary School",
  schoolEmisNumber: "EMIS-0001",
  formerName: "",
  logoUrl: "/brand/governed/namibia-coat-of-arms.png",
  logoStoragePath: "",
  schoolNameFont: "old_english",
  contactLines: [],
  postalLines: [],
  governedCoatOfArms: {
    key: "namibia-coat-of-arms",
    version: "2026-10-05",
    url: "/brand/governed/namibia-coat-of-arms.png",
    alt: "Coat of Arms of Namibia",
  },
  provenance: {
    source: "live_school_profile",
    governedAssetKey: "namibia-coat-of-arms",
    governedAssetVersion: "2026-10-05",
  },
});
