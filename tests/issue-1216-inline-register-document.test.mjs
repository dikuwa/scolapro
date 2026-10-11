import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const adapter = read("src/features/attendance/inline-register-document.ts");
const panel = read("src/features/attendance/inline-register-document-panel.tsx");
const route = read("src/app/api/attendance/register-teacher/route.ts");
const workspace = read("src/features/attendance/register-teacher-workspace.tsx");

test("inline register panel exposes empty, loading, error, offline, retry and success states", () => {
  assert.match(panel, /Choose a complete register period/);
  assert.match(panel, /<Spinner/);
  assert.match(panel, /Register document unavailable/);
  assert.match(panel, /You are offline\. Reconnect/);
  assert.match(panel, />\s*Retry\s*</);
  assert.match(panel, /srcDoc=\{state\.document\.html\}/);
  assert.match(workspace, /<InlineRegisterDocumentPanel/);
});

test("one resolved model bundle supplies inline, preview, print and PDF", () => {
  assert.match(route, /format === "pdf" \|\| format === "bundle"/);
  assert.match(route, /renderRegisterTeacherPdf/);
  assert.match(route, /const html = renderRegisterTeacherHtml\(\{ header, document \}\)/);
  assert.match(route, /identity/);
  assert.match(panel, /new Blob\(\[state\.document\.html\]/);
  assert.match(panel, /pdfBlob\(state\.document\)/);
  assert.match(panel, /previewHref=\{documentUrls\?\.previewUrl\}/);
  assert.match(panel, /previewDownloadHref=\{documentUrls\?\.downloadUrl\}/);
  assert.doesNotMatch(panel, /fetch\(/);
});

test("selector-scoped adapter caches identical keys and requests one bundle", () => {
  assert.match(adapter, /new Map<string, Promise<InlineRegisterDocument>>/);
  assert.match(adapter, /selection\.schoolId/);
  assert.match(adapter, /selection\.classId/);
  assert.match(adapter, /selection\.termId/);
  assert.match(adapter, /selection\.mode/);
  assert.match(adapter, /format: "bundle"/);
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "tests/helpers/issue-1216-inline-register-worker.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /inline register cache scenarios passed/);
});

test("superseded selector requests abort and the document remains in print colours", () => {
  assert.match(panel, /new AbortController\(\)/);
  assert.match(panel, /controller\.abort\(\)/);
  assert.match(panel, /bg-surface-subtle/);
  assert.match(panel, /shadow-\[var\(--shadow-xs\)\]/);
  assert.doesNotMatch(panel, /dark:invert|filter:invert/);
});
