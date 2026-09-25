import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/room-inventory/room-inventory-workspace.tsx", "utf8");

test("room inventory uses display-name-first room labels", () => {
  assert.match(source, /label: `\$\{r\.block \? `\$\{r\.block\} · ` : ""\}\$\{r\.name\}`/);
  assert.doesNotMatch(source, /\$\{r\.code\} · \$\{r\.name\}/);
  assert.match(source, /<h2 className="mt-1 font-semibold">\{room\.name\}<\/h2>/);
});

test("room inventory keeps add form collapsed until requested", () => {
  assert.match(source, /const \[addOpen, setAddOpen\] = useState\(false\)/);
  assert.match(source, /\{addOpen \? \(/);
  assert.match(source, /\+ Add inventory item/);
  assert.match(source, /const createAndClose = async[\s\S]*if \(result\.success\)[\s\S]*setAddOpen\(false\)/);
});

test("room inventory exposes one edit-on-demand item editor", () => {
  assert.match(source, /const \[editingItemId, setEditingItemId\] = useState<string \| null>\(null\)/);
  assert.match(source, /expanded=\{editingItemId === i\.id\}/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /\{expanded \? \(/);
  assert.match(source, /const changeAndClose = async[\s\S]*if \(result\.success\) setEditingItemId\(null\)/);
});

test("room inventory preserves filters and clear-filter convention", () => {
  assert.match(source, /label="Room"/);
  assert.match(source, /label="Ownership"/);
  assert.match(source, /label="Condition"/);
  assert.match(source, /Search item \/ asset no\./);
  assert.match(source, /Clear filters/);
  assert.match(source, /\{visible\.length\} \{visible\.length === 1 \? "item" : "items"\}/);
});

test("room inventory preserves custodian provenance and verification workflow", () => {
  assert.match(source, /Home room default/);
  assert.match(source, /Manual override/);
  assert.match(source, /action=\{verify\}/);
  assert.match(source, /Verification history/);
});
