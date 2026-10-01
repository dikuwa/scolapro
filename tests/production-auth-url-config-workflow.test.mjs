import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/production-auth-url-config.yml", "utf8");

test("production Auth URL workflow is manual and read-scoped", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /confirmation == 'DEPLOY'/);
});

test("production Auth URL workflow targets only the canonical project and governed URLs", () => {
  assert.match(workflow, /PROJECT_REF: jhgumnvhoxmapmgotchu/);
  assert.match(workflow, /SITE_URL: https:\/\/scola-pro\.vercel\.app/);
  assert.match(workflow, /http:\/\/localhost:3000\/\*\*/);
  assert.match(workflow, /https:\/\/scola-pro\.vercel\.app\/\*\*/);
  assert.match(workflow, /https:\/\/\*-martin-mukoyas-projects\.vercel\.app\/\*\*/);
});

test("production Auth URL workflow patches only site_url and uri_allow_list", () => {
  assert.match(workflow, /\/v1\/projects\/\$PROJECT_REF\/config\/auth/);
  assert.match(workflow, /--request PATCH/);
  assert.match(
    workflow,
    /'\{site_url: \$site_url, uri_allow_list: \$uri_allow_list\}'/,
  );
  assert.match(workflow, /test "\$\(jq 'keys \| length'/);
  assert.doesNotMatch(workflow, /supabase config push/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("production Auth URL workflow verifies exact deployed values", () => {
  assert.match(
    workflow,
    /\.site_url == \$site_url and \.uri_allow_list == \$uri_allow_list/,
  );
  assert.match(workflow, /Verified production Auth URL configuration:/);
});
