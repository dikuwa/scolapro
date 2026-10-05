import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/documents/server/live-school-document-profile.ts", "utf8");
const attendanceRoute = readFileSync("src/app/api/official-documents/attendance-summary/route.ts", "utf8");
const teachingPackRoute = readFileSync("src/app/api/official-documents/teaching-pack/route.ts", "utf8");
const teachingPlanRoute = readFileSync("src/app/api/official-documents/teaching-plan/route.ts", "utf8");

test("live document profile does not fail official exports when optional logo storage is unavailable", () => {
  assert.match(source, /school document logo unavailable; continuing with profile or bundled fallback/);
  assert.doesNotMatch(source, /if \(logoError\) throw new Error\("Unable to load the school document logo\."\)/);
  assert.match(source, /logo_storage_path: logoStoragePath/);
  assert.match(source, /resolveFrozenOfficialDocumentHeaderAssets/);
  assert.match(source, /createSignedUrl\(header\.logoStoragePath, 3600\)/);
});

test("official PDF routes never remote-fetch bundled relative school logo paths", () => {
  for (const route of [attendanceRoute, teachingPackRoute, teachingPlanRoute]) {
    assert.match(route, /!\/\^https\?:/);
    assert.match(route, /try \{[\s\S]*fetch\(signedUrl, \{ cache: "no-store" \}\)[\s\S]*\} catch \{[\s\S]*return null;/);
  }
});
