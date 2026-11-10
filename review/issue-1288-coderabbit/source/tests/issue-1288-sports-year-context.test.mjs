import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../src/features/sports-houses/sports-houses-workspace.tsx", import.meta.url),
  "utf8",
);
const action = readFileSync(
  new URL("../src/features/sports-houses/server/actions.ts", import.meta.url),
  "utf8",
).split("export async function saveSportsYearReferenceDate")[1]
  .split("export async function changeSportsHouseStatus")[0];

test("Sports Year context keeps its summary and year picker in the inline editor card", () => {
  const card = workspace.split(">Year context</h2>")[1].split("</section>")[0];

  assert.match(card, /Official age reference date/);
  assert.match(card, /Not configured/);
  assert.match(card, /Assignment continuity/);
  assert.match(card, /<YearPicker\b/);
  assert.match(workspace, /import \{ CardActionToggle \} from "@\/components\/ui\/card-action-toggle"/);
  assert.match(card, /\{canManageYearContext \? \(\s*<CardActionToggle\b/);
  assert.match(card, /controls="sports-year-reference-date-editor"/);
  assert.match(card, /<SportsYearReferenceDateForm\b/);
});

test("the Sports date editor retains the academic-year bounds and the governed action", () => {
  const editor = workspace.split("function SportsYearReferenceDateForm")[1]
    .split("function SportsYearContext")[0];

  assert.match(workspace, /saveSportsYearReferenceDate\(previous, formData\)/);
  assert.match(editor, /action=\{action\}/);
  assert.match(editor, /min=\{`\$\{academicYear\}-01-01`\}/);
  assert.match(editor, /max=\{`\$\{academicYear\}-12-31`\}/);
  assert.match(editor, /name="schoolApprovalConfirmed"/);
  assert.match(action, /schoolApprovalConfirmed: z\.literal\("on"\)/);
  assert.match(action, /canSetSportsYearReferenceDate\(parsed\.data\.schoolId\)/);
  assert.match(action, /rpc\("set_sports_year_reference_date"/);
});
