import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dev = readFileSync("scripts/run-local-dev.mjs", "utf8");
const seed = readFileSync("scripts/seed-local-auth.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const gitignore = readFileSync(".gitignore", "utf8");

test("default development resolves credentials from the loopback Supabase stack", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/run-local-dev.mjs");
  assert.match(dev, /supabase", \["status", "-o", "json"\]/);
  assert.match(dev, /NEXT_PUBLIC_SUPABASE_URL: status\.API_URL/);
  assert.match(dev, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status\.PUBLISHABLE_KEY/);
  assert.match(dev, /SUPABASE_SERVICE_ROLE_KEY: status\.SERVICE_ROLE_KEY/);
  assert.match(dev, /Refusing to use a non-loopback Supabase URL/);
});

test("local Auth provisioning is explicit, password-gated and loopback-only", () => {
  assert.match(seed, /SCOLAPRO_LOCAL_ADMIN_PASSWORD/);
  assert.match(seed, /password\.length < 12/);
  assert.match(seed, /Refusing to seed Auth outside the local Supabase stack/);
  assert.match(seed, /role_key: "school_admin"/);
  assert.match(seed, /\.from\("schools"\)/);
  assert.match(seed, /tenant_id: school\.tenant_id/);
  assert.match(seed, /Local demo school tenant does not match the repository seed/);
  assert.doesNotMatch(seed, /https:\/\//);
});

test("Next 16 generated types are stable without tracking generated next-env", () => {
  assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
  assert.ok(tsconfig.include.includes(".next/dev/types/**/*.ts"));
  assert.match(gitignore, /^next-env\.d\.ts$/m);
});
