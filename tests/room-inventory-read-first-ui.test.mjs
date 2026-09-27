import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/room-inventory/room-inventory-workspace.tsx", "utf8");
const page = readFileSync("src/app/school/room-inventory/page.tsx", "utf8");

test("room inventory is summary-first and uses room cards instead of a primary room form", () => {
  assert.match(source, /Rooms in scope/);
  assert.match(source, /Scan responsibility, verification and inventory health before opening a room/);
  assert.match(source, /placeholder="Find a room"/);
  assert.match(source, /searchable/);
  assert.match(source, /Type room, block or custodian/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(source, /<Picker\s+label="Room"/);
});

test("custodian view is owner-first and manager controls remain separate", () => {
  assert.match(page, /My Room Inventory/);
  assert.match(page, /viewerStaffMemberIds/);
  assert.match(source, /Your room/);
  assert.match(source, /Responsible custodian/);
  assert.match(source, /Manage responsibility/);
  assert.match(source, /canAssign && responsibilityOpen/);
});

test("room assignment and verification forms stay collapsed until requested", () => {
  assert.match(source, /const \[responsibilityOpen, setResponsibilityOpen\] = useState\(false\)/);
  assert.match(source, /const \[verifyOpen, setVerifyOpen\] = useState\(false\)/);
  assert.match(source, /Verify inventory/);
  assert.match(source, /Close verification/);
  assert.match(source, /Manage responsibility/);
  assert.match(source, /action=\{verify\}/);
  assert.match(source, /action=\{assign\}/);
});

test("room inventory keeps add and change forms on demand", () => {
  assert.match(source, /const \[addOpen, setAddOpen\] = useState\(false\)/);
  assert.match(source, /\+ Add inventory item/);
  assert.match(source, /const \[editingItemId, setEditingItemId\] = useState<string \| null>\(null\)/);
  assert.match(source, /Record change/);
  assert.match(source, /aria-expanded=\{expanded\}/);
});

test("inventory filters are scoped to the selected room and keep clear-filter convention", () => {
  assert.match(source, /Search item \/ asset no\./);
  assert.match(source, /Search this room/);
  assert.match(source, /label="Ownership"/);
  assert.match(source, /label="Condition"/);
  assert.match(source, /Clear filters/);
  assert.match(source, /max-h-\[34rem\].*overflow-auto/);
});

test("room cards surface health, verification and custodian provenance", () => {
  assert.match(source, /Needs attention/);
  assert.match(source, /Never verified/);
  assert.match(source, /No flagged items/);
  assert.match(source, /Home room default/);
  assert.match(source, /Manual override/);
  assert.match(source, /Verification history/);
});

test("verified rooms retain preview print and PDF actions", () => {
  assert.match(source, /room\.lastVerified \? \(/);
  assert.match(source, /Preview sheet/);
  assert.match(source, /&print=1/);
  assert.match(source, /&format=pdf/);
});


test("selecting a room opens a responsive room workspace overlay", () => {
  assert.match(source, /const \[overlayOpen, setOverlayOpen\] = useState\(false\)/);
  assert.match(source, /setOverlayOpen\(true\)/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /sm:max-w-6xl/);
  assert.match(source, /h-full w-full/);
  assert.match(source, /Close room workspace/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.doesNotMatch(source, /scrollIntoView/);
});

test("room finder uses the shared searchable Picker and opens the selected room", () => {
  assert.match(source, /ariaLabel="Find a room"/);
  assert.match(source, /searchPlaceholder="Type room, block or custodian"/);
  assert.match(source, /helper: \[candidate\.block, candidate\.custodianName\]/);
  assert.match(source, /if \(value\) selectRoom\(value\)/);
});
