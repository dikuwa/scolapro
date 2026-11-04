import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const core = read("src/features/academics/academic-setup-core.tsx");
const toggle = read("src/components/ui/card-action-toggle.tsx");
const cycle = read("src/features/timetable/timetable-cycle-settings.tsx");
const page = read("src/app/school/setup/page.tsx");
const hod = read("src/features/academics/hod-scope-configuration.tsx");

test("Academic Setup keeps summary and edit surface in the same card", () => {
  assert.match(core, /function CoreSetupCard/);
  assert.doesNotMatch(core, /function CoreSetupRow/);
  assert.match(core, /<CardActionToggle open=\{active\} controls=\{panelId\}/);
  assert.match(core, /id=\{panelId\}/);
  assert.match(core, /active \? editor : summary/);
  for (const name of ["workflow", "anchor"]) {
    assert.match(core, new RegExp(`panelId="academic-setup-panel-${name}"`));
  }
});
test("shared toggle is compact, accessible, and uses soft brand/danger tokens", () => {
  assert.match(toggle, /aria-expanded=\{open\}/);
  assert.match(toggle, /aria-controls=\{controls\}/);
  assert.match(toggle, /open \? X/);
  assert.match(toggle, /bg-brand-soft/);
  assert.match(toggle, /var\(--danger\)/);
  assert.match(toggle, /"Close"/);
  assert.doesNotMatch(core, /Close timetable settings/);
});
test("workflow and anchor editors are independent without duplicate headings", () => {
  assert.match(cycle, /section\?: "both" \| "workflow" \| "anchor"/);
  assert.match(page, /section="workflow"/);
  assert.match(page, /section="anchor"/);
  assert.match(core, /editor=\{anchorEditor\}/);
});
test("HOD portfolio summaries and history stay available in their standalone section", () => {
  assert.match(page, /<HodScopeConfiguration/);
  assert.match(hod, /portfolios\.map\(\(portfolio\) =>/);
  assert.match(hod, /Subject responsibility history/);
  assert.match(hod, /open=\{openScopeId === portfolio\.id\}/);
});

test("calendar anchor edit is unavailable for a weekday-only timetable", () => {
  assert.match(core, /actionDisabled=\{!rotating\}/);
  assert.match(core, /actionDisabled \? \(/);
  assert.match(toggle, /disabled=\{disabled\}/);
});
