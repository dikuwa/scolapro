import assert from "node:assert/strict";
import {
  inlineRegisterDocumentKey,
  invalidateInlineRegisterDocument,
  resolveInlineRegisterDocument,
} from "../../src/features/attendance/inline-register-document.ts";

const selection = {
  schoolId: "school-a",
  classId: "class-a",
  date: "2026-10-09",
  mode: "week",
  termId: "term-a",
  fromWeek: "2026-10-05",
  toWeek: "2026-10-05",
};

let fetchCount = 0;
globalThis.fetch = async () => {
  fetchCount += 1;
  return Response.json({ identity: "document-a", html: "<html></html>", pdfBase64: "JVBERg==", fileName: "register.pdf" });
};

const [first, second] = await Promise.all([
  resolveInlineRegisterDocument(selection),
  resolveInlineRegisterDocument({ ...selection }),
]);
assert.equal(fetchCount, 1, "an unchanged resolved selector key must not fetch twice");
assert.strictEqual(first, second);
assert.notEqual(inlineRegisterDocumentKey(selection), inlineRegisterDocumentKey({ ...selection, date: "2026-10-10" }), "selection date must invalidate term-to-date totals and the PDF bundle");

const nextWeek = { ...selection, date: "2026-10-16", fromWeek: "2026-10-12", toWeek: "2026-10-12" };
await resolveInlineRegisterDocument(nextWeek);
assert.equal(fetchCount, 2, "a changed week must resolve a new document");

await resolveInlineRegisterDocument(selection);
assert.equal(fetchCount, 3, "a completed bundle is not cached indefinitely after attendance revisions or renderer updates");

invalidateInlineRegisterDocument(selection);
await resolveInlineRegisterDocument(selection);
assert.equal(fetchCount, 4, "retry invalidation must permit one fresh request");

console.log("inline register cache scenarios passed");
