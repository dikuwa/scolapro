import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const devScript = readFileSync("scripts/run-local-dev.mjs","utf8");
const pkg = JSON.parse(readFileSync("package.json","utf8"));

test("local dev applies all pending migrations including newly-added backdated versions", () => {
  assert.match(devScript,/\["migration", "up", "--local", "--include-all"\]/);
  assert.equal(pkg.scripts["local:sync-db"],"supabase migration up --local --include-all");
});

test("local dev migration failure guidance points to the canonical sync command", () => {
  assert.match(devScript,/pnpm local:sync-db/);
  assert.match(devScript,/newly-added backdated versions/);
});
