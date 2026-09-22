import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const library = readFileSync("src/app/library/page.tsx", "utf8");

test("library returns authenticated shell before workspace data resolves", () => {
  assert.match(library, /<Suspense fallback=\{<WorkspaceLoading/);
  assert.match(library, /async function LibraryWorkspaceData/);
  const pageStart = library.indexOf("export default async function LibraryPage");
  const helperStart = library.indexOf("async function LibraryWorkspaceData");
  assert.equal(library.slice(pageStart, helperStart).includes("await getLibraryWorkspace"), false);
});
