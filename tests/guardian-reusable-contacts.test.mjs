import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/features/guardians/server/queries.ts", "utf8");

test("reusable guardian contacts use URI-safe batches", () => {
  assert.match(source, /POSTGREST_IN_BATCH_SIZE = 40/);
  assert.match(source, /function chunkIds\(ids: string\[\]\)/);
  assert.match(source, /for \(const batch of chunkIds\(ids\)\)/);
  assert.match(source, /\.in\("guardian_id", batch\)/);
  assert.doesNotMatch(source, /\.in\("guardian_id", ids\)/);
});
