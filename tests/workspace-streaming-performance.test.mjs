import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const library = readFileSync("src/app/library/page.tsx", "utf8");
const teaching = readFileSync("src/app/teaching/page.tsx", "utf8");

test("library returns authenticated shell before workspace data resolves", () => {
  assert.match(library, /<Suspense fallback=\{<WorkspaceLoading/);
  assert.match(library, /async function LibraryWorkspaceData/);
  const pageStart = library.indexOf("export default async function LibraryPage");
  const helperStart = library.indexOf("async function LibraryWorkspaceData");
  assert.equal(library.slice(pageStart, helperStart).includes("await getLibraryWorkspace"), false);
});

test("teaching returns authenticated shell before governed workspace data resolves", () => {
  assert.match(teaching, /<Suspense fallback=\{<TeachingLoading/);
  assert.match(teaching, /async function TeachingWorkspaceData/);
  const pageStart = teaching.indexOf("export default async function TeachingPage");
  const helperStart = teaching.indexOf("async function TeachingWorkspaceData");
  const pageBody = teaching.slice(pageStart, helperStart);
  assert.equal(pageBody.includes("await getGovernedAcademicYear"), false);
  assert.equal(pageBody.includes("await getTeachingWorkspace"), false);
});
