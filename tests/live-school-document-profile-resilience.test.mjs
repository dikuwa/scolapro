import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/documents/server/live-school-document-profile.ts", "utf8");

test("live document profile does not fail official exports when optional logo storage is unavailable", () => {
  assert.match(source, /school document logo unavailable; continuing with profile or bundled fallback/);
  assert.match(source, /resolvedLogoStoragePath = ""/);
  assert.doesNotMatch(source, /if \(logoError\) throw new Error\("Unable to load the school document logo\."\)/);
  assert.match(source, /logo_storage_path: resolvedLogoStoragePath/);
});
