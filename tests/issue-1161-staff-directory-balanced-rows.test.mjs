import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/staff/page.tsx", "utf8");
const access = readFileSync("src/features/staff/staff-access-manager.tsx", "utf8");
const recordAction = readFileSync("src/components/ui/record-action-button.tsx", "utf8");

test("staff desktop rows allocate the widest flexible region to ScolaPro access", () => {
  assert.match(page, /lg:grid-cols-\[2rem_minmax\(15rem,1\.1fr\)_minmax\(12rem,0\.72fr\)_minmax\(24rem,1\.45fr\)\]/);
  assert.match(access, /bg-surface-muted\/35/);
  assert.match(access, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
});

test("tablet rows place access below identity and placement without horizontal-only assumptions", () => {
  assert.match(page, /md:grid-cols-\[2rem_minmax\(0,1fr\)_minmax\(11rem,0\.8fr\)\]/);
  assert.match(access, /md:col-start-2 md:col-end-4 lg:col-start-4 lg:col-end-5/);
});

test("closed linked-account rows cap role preview at two labels plus an overflow count", () => {
  assert.match(access, /visibleRoles\.slice\(0, 2\)/);
  assert.match(access, /hiddenRoleCount/);
  assert.match(access, /rolePreview\.join\(" · "\)/);
  assert.match(access, /\+\$\{hiddenRoleCount\}/);
});

test("access and identity panels use one mutually exclusive row state and full-width tray", () => {
  assert.match(access, /type StaffRowPanel = "access" \| "identity" \| null/);
  assert.match(access, /setPanel\(\(current\) => current === next \? null : next\)/);
  assert.match(access, /panel === "access"/);
  assert.match(access, /panel === "identity"/);
  assert.match(access, /md:col-start-2 md:col-end-4 lg:col-start-2 lg:col-end-5/);
});

test("manage access keeps a stable label and uses disclosure rotation instead of a misleading close-access label", () => {
  assert.match(access, />\s*Manage access\s*</);
  assert.match(access, /rotate-180/);
  assert.doesNotMatch(access, /Close access/);
});

test("record edit affordance composes the canonical Button and supports semantic variants", () => {
  assert.match(recordAction, /import \{ Button, type ButtonProps \} from "@\/components\/ui\/button"/);
  assert.match(recordAction, /variant\?: ButtonProps\["variant"\]/);
  assert.match(recordAction, /<Button/);
  assert.match(access, /<RecordActionButton/);
  assert.match(access, /icon=\{Pencil\}/);
  assert.match(access, /label="Manage identity"/);
});

test("placement metadata keeps room with placement and staff code with identity", () => {
  assert.match(page, /row\.staffCode \? `Code \$\{row\.staffCode\}` : null/);
  assert.match(page, /row\.defaultRoomName \? <p/);
});
