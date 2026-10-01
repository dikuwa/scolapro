import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/features/teaching/components/operational-teaching-files.tsx", import.meta.url), "utf8");

test("Issue #886 presents the four teacher-file workspace", () => {
  for (const label of [
    "Preparation File",
    "Administration File",
    "Assessment / Question Paper File",
    "Professional Development / Resource File",
  ]) assert.match(source, new RegExp(label.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\test("Issue #886 presents the four teacher-file workspace", () => {
  for (const label of [
    "Preparation File",
    "Administration File",
    "Assessment / Question Paper File",
    "Professional Development / Resource File",
  ]) assert.match(source, new RegExp(label.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  assert.match(source, /File \{index \+ 1\}/);
  assert.match(source, /requirements available/);
});
")));
  assert.match(source, /File \{index \+ 1\}/);
  assert.match(source, /requirements available/);
});

test("four canonical teacher-file directories remain visible when a subject template is not yet verified", () => {
  assert.match(source, /Template not yet verified for current subjects/);
  assert.match(source, /four canonical teacher-file directories remain available/);
  const directoryGrid = source.indexOf("grid gap-3 sm:grid-cols-2 xl:grid-cols-4");
  const governedRequirementFilters = source.indexOf("{hasGovernedFiles ? (", directoryGrid);
  assert.ok(directoryGrid >= 0, "folder directory grid must exist");
  assert.ok(governedRequirementFilters > directoryGrid, "folder directory must render before governed-template-only requirement filters");
});

test("Subject File remains separate from the four teacher folders", () => {
  assert.match(source, /Subject File is separate/);
  assert.match(source, /href="\/teaching\/subject-file"/);
  const definitions = source.slice(source.indexOf("const definitions"), source.indexOf("return definitions.map"));
  assert.doesNotMatch(definitions, /key: "subject"/);
});

test("folder selection drives the existing governed requirement view", () => {
  assert.match(source, /useState\("preparation"\)/);
  assert.match(source, /onClick=\{\(\) => setFileType\(folder.key\)\}/);
  assert.match(source, /currentFileType\.fileTypeKey !== fileType/);
  assert.match(source, /OperationalFileDocumentBindingForm/);
  assert.match(source, /OperationalFileExternalReferenceForm/);
});

const resolver = await readFile(new URL("../src/features/teaching/server/operational-file-resolvers.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/features/teaching/server/operational-files-workspace.ts", import.meta.url), "utf8");

test("multi-subject evidence preserves allocation scope", () => {
  assert.match(workspace, /allocationIdsForItems/);
  assert.match(workspace, /allocationIds: allocationIdsForItems/);
  assert.match(resolver, /preparationRecords\.filter\(\(record\) => record\.allocationId === input\.allocationId\)/);
  assert.match(resolver, /allocationId: input\.allocationIds\?\.\[index\]/);
});

test("evidence actions distinguish governed references from teacher-supplied uploads", () => {
  assert.match(source, /Official source/);
  assert.match(source, /\["shared_resource", "external_link"\]\.includes\(item\.resolverType\)/);
  assert.match(source, /completion still depends on the evidence resolver/);
  assert.match(source, /teacher-supplied evidence only for this requirement/);
});

test("unsupported-only allocations use a compact honest state instead of an empty folder workspace", () => {
  assert.match(source, /const hasGovernedFiles = workspace\.allocations\.length > 0/);
  assert.match(source, /current teaching allocations do not yet have a verified operational-file template/);
  assert.match(source, /workspace\.unsupportedAllocations\.length && hasGovernedFiles/);
});
