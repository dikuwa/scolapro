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
  ]) assert.match(source, new RegExp(label.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  assert.match(source, /File \{index \+ 1\}/);
  assert.match(source, /requirements available/);
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
