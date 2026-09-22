import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/library/page.tsx", "utf8");
const queries = readFileSync("src/features/library/server/queries.ts", "utf8");
const workspace = readFileSync("src/features/library/library-workspace.tsx", "utf8");

test("library workspace view is URL-controlled so inactive tabs need not hydrate their data", () => {
  assert.match(page, /searchParams/);
  assert.match(page, /getLibraryWorkspace\(membership\.schoolId, today, view\)/);
  assert.match(workspace, /href=\{href\}/);
  assert.doesNotMatch(workspace, /setView\(tab\.value\)/);
});

test("borrower and loan datasets load only for class or circulation views", () => {
  assert.match(queries, /needsCirculationData = view === "circulation" \|\| view === "class"/);
  assert.match(queries, /learnersRequest = needsCirculationData/);
  assert.match(queries, /staffRequest = needsCirculationData/);
  assert.match(queries, /loansRequest = needsCirculationData/);
});

test("offline circulation snapshot is not overwritten by unloaded views", () => {
  assert.match(workspace, /view !== "circulation"/);
  assert.match(workspace, /cacheLibraryCirculationSnapshot/);
});
