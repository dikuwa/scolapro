import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  APPROVED_REFS_ENV,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_ID_ENV,
  evaluateStagingProjectRef,
  parseApprovedStagingRefs,
} from "../scripts/lib/staging-project-ref-guard.mjs";

const workflow = readFileSync(".github/workflows/staging-database.yml", "utf8");

// A well-formed, non-production ref used as the "approved" fixture.
const APPROVED_REF = "abcdefghijklmnopqrst";
// A second well-formed, unrelated non-production ref (not approved).
const OTHER_NONPROD_REF = "zyxwvutsrqponmlkjihg";

// ---------------------------------------------------------------------------
// Existing static assertions on the workflow file (preserved).
// ---------------------------------------------------------------------------

test("staging bridge validation derives repository totals dynamically", () => {
  assert.match(workflow, /bridge_count="\$\{#bridge_files\[@\]\}"/);
  assert.match(workflow, /bridge_suffix_count="\$\(wc -l < \/tmp\/scolapro-bridge-suffixes\.txt/);
  assert.match(workflow, /"\$duplicate_count" -ne "\$bridge_suffix_count"/);
  assert.doesNotMatch(workflow, /Expected (?:exactly )?\d+ (?:staging-history bridge files|unique canonical duplicate versions)/);
});

test("each bridge suffix allows historical aliases but exactly one canonical migration", () => {
  assert.match(workflow, /bridge_matches=0/);
  assert.match(workflow, /canonical_candidates=\(\)/);
  assert.match(workflow, /"\$bridge_matches" -lt 1 \|\| \$\{#canonical_candidates\[@\]\} -ne 1/);
  assert.match(workflow, /one or more historical bridges and exactly one canonical migration/);
});

test("staging mutation steps remain explicitly gated", () => {
  assert.match(workflow, /name: Reconcile duplicate migration versions\n\s+if: \$\{\{ inputs\.confirmation == 'RECONCILE' \}\}/);
  assert.match(workflow, /name: Apply pending migrations\n\s+if: \$\{\{ inputs\.confirmation == 'DEPLOY' \}\}/);
  assert.match(workflow, /name: Preview pending migrations\n\s+run: supabase db push --linked --dry-run --include-all/);
});

test("staging workflow refuses the documented production Supabase project", () => {
  assert.match(workflow, /PRODUCTION_PROJECT_ID: jhgumnvhoxmapmgotchu/);
  assert.match(
    workflow,
    /if \[\[ "\$STAGING_PROJECT_ID" == "\$PRODUCTION_PROJECT_ID" \]\]; then/,
  );
  assert.match(workflow, /Refusing staging workflow: STAGING_PROJECT_ID points to the production project/);
  assert.match(
    workflow,
    /Require staging deployment secrets[\s\S]*production project[\s\S]*- name: Link staging project/,
  );
});

// ---------------------------------------------------------------------------
// Approval-gate wiring.
// ---------------------------------------------------------------------------

test("staging workflow binds the approval allowlist to a repository variable, not the ref secret", () => {
  assert.match(
    workflow,
    /SCOLAPRO_E2E_APPROVED_STAGING_REFS: \$\{\{ vars\.SCOLAPRO_E2E_APPROVED_STAGING_REFS \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /SCOLAPRO_E2E_APPROVED_STAGING_REFS: \$\{\{ secrets\./,
  );
  assert.doesNotMatch(
    workflow,
    /SCOLAPRO_E2E_APPROVED_STAGING_REFS:.*STAGING_PROJECT_ID/,
  );
});

test("staging workflow runs the fail-closed ref gate with the shared validator", () => {
  assert.match(
    workflow,
    /- name: Verify approved staging project ref \(fail-closed\)\n\s+shell: bash\n\s+run: node scripts\/validate-staging-project-ref\.mjs/,
  );
});

test("staging workflow does not silently create a GitHub environment", () => {
  // The repository defines only Preview/Production environments; declaring a new
  // one would mutate environment rules. The gate, not an environment, is the
  // enforced boundary until governance approves a staging environment.
  assert.doesNotMatch(workflow, /^\s+environment:/m);
});

// ---------------------------------------------------------------------------
// Step ordering.
// ---------------------------------------------------------------------------

/** Extracts the job's steps in document order with their `name:` and full body. */
function parseSteps(text) {
  const steps = [];
  let current = null;
  for (const line of text.split("\n")) {
    const start = /^ {6}- (.*)$/.exec(line);
    if (start) {
      if (current) steps.push(current);
      current = { name: "", body: `${start[1]}\n` };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) steps.push(current);
  for (const step of steps) {
    const named = /^name:\s*(.*)$/m.exec(step.body);
    step.name = named ? named[1].trim() : "";
  }
  return steps;
}

const steps = parseSteps(workflow);
const stepIndex = (predicate) => steps.findIndex(predicate);
const guardIndex = stepIndex((s) => s.name === "Verify approved staging project ref (fail-closed)");

// A Supabase *CLI invocation* (not the `supabase/setup-cli` action). Comments are
// stripped first so prose that mentions `supabase link`/`db push` cannot be
// mistaken for an executable command.
const SUPABASE_CLI_CALL = /\bsupabase\s+(?:link|migration|db|projects|functions|secrets|gen|inspect|start|stop|status|login|logout)\b/;

const stripComments = (text) =>
  text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

const invokesSupabaseCli = (step) => SUPABASE_CLI_CALL.test(stripComments(step.body));

const cliStepIndices = steps
  .map((step, index) => (invokesSupabaseCli(step) ? index : -1))
  .filter((index) => index >= 0);

test("the ref gate is the first substantive step, before the CLI is even installed", () => {
  assert.ok(guardIndex >= 0, "expected a fail-closed ref gate step");
  const setupIndex = stepIndex((s) => /Setup Supabase CLI/.test(s.name));
  assert.ok(setupIndex >= 0, "expected a Setup Supabase CLI step");
  assert.ok(
    guardIndex < setupIndex,
    "the ref gate must run before the Supabase CLI is installed",
  );
});

test("the ref gate precedes every Supabase CLI invocation (link, migration, db push)", () => {
  assert.ok(cliStepIndices.length >= 4, "expected several Supabase CLI invocation steps");
  for (const index of cliStepIndices) {
    assert.ok(
      guardIndex < index,
      `the ref gate must run before CLI step "${steps[index].name}"`,
    );
  }
  const linkIndex = stepIndex((s) => /Link staging project/.test(s.name));
  assert.ok(linkIndex >= 0 && guardIndex < linkIndex, "the ref gate must run before `supabase link`");
});

test("the ref gate is unconditional and precedes both RECONCILE and DEPLOY steps", () => {
  const guardStep = steps[guardIndex];
  assert.doesNotMatch(guardStep.body, /^\s+if:/m, "the gate must run for all modes");

  const reconcileIndex = stepIndex((s) => /Reconcile duplicate migration versions/.test(s.name));
  const deployIndex = stepIndex((s) => /Apply pending migrations/.test(s.name));
  assert.ok(reconcileIndex >= 0 && deployIndex >= 0);
  assert.ok(guardIndex < reconcileIndex, "gate must precede the RECONCILE step");
  assert.ok(guardIndex < deployIndex, "gate must precede the DEPLOY step");
});

// ---------------------------------------------------------------------------
// Workflow simulation: denied targets issue zero Supabase CLI calls.
// ---------------------------------------------------------------------------

/**
 * Replays the workflow's preflight in document order using the real guard module.
 * Records the name of every step that would invoke the Supabase CLI. Returns as
 * soon as the gate denies — exactly as the workflow would fail the step.
 */
function runPreflight(env) {
  const cliCalls = [];
  for (const step of steps) {
    if (step.name === "Verify approved staging project ref (fail-closed)") {
      const result = evaluateStagingProjectRef({
        stagingProjectId: env[STAGING_PROJECT_ID_ENV],
        approvedRefsRaw: env[APPROVED_REFS_ENV],
      });
      if (!result.ok) return { approved: false, code: result.code, cliCalls };
      continue;
    }
    if (invokesSupabaseCli(step)) cliCalls.push(step.name);
  }
  return { approved: true, code: "approved", cliCalls };
}

const deniedScenarios = [
  ["production ref", { [STAGING_PROJECT_ID_ENV]: PRODUCTION_PROJECT_REF, [APPROVED_REFS_ENV]: APPROVED_REF }],
  ["unrelated nonprod ref (unapproved)", { [STAGING_PROJECT_ID_ENV]: OTHER_NONPROD_REF, [APPROVED_REFS_ENV]: APPROVED_REF }],
  ["absent approvals (empty allowlist)", { [STAGING_PROJECT_ID_ENV]: APPROVED_REF, [APPROVED_REFS_ENV]: "" }],
  ["missing project id", { [STAGING_PROJECT_ID_ENV]: "", [APPROVED_REFS_ENV]: APPROVED_REF }],
  ["malformed project id (too short)", { [STAGING_PROJECT_ID_ENV]: "shortref", [APPROVED_REFS_ENV]: APPROVED_REF }],
  ["malformed project id (uppercase)", { [STAGING_PROJECT_ID_ENV]: "ABCDEFGHIJKLMNOPQRST", [APPROVED_REFS_ENV]: APPROVED_REF }],
  ["mixed allowlist (valid + malformed)", { [STAGING_PROJECT_ID_ENV]: APPROVED_REF, [APPROVED_REFS_ENV]: `${APPROVED_REF},not-a-ref` }],
  ["allowlist containing production ref", { [STAGING_PROJECT_ID_ENV]: APPROVED_REF, [APPROVED_REFS_ENV]: `${APPROVED_REF},${PRODUCTION_PROJECT_REF}` }],
];

for (const [label, env] of deniedScenarios) {
  test(`denied path issues zero Supabase CLI calls: ${label}`, () => {
    const result = runPreflight(env);
    assert.equal(result.approved, false, "expected the gate to deny");
    assert.deepEqual(result.cliCalls, [], "a denied target must issue no Supabase CLI calls");
  });
}

test("approved path issues Supabase CLI calls (proves the simulation reaches CLI steps)", () => {
  const result = runPreflight({
    [STAGING_PROJECT_ID_ENV]: APPROVED_REF,
    [APPROVED_REFS_ENV]: APPROVED_REF,
  });
  assert.equal(result.approved, true);
  assert.ok(result.cliCalls.length > 0, "an approved target should reach CLI steps");
  assert.ok(result.cliCalls.some((name) => /Link staging project/.test(name)));
});

// ---------------------------------------------------------------------------
// Guard decision matrix (unit).
// ---------------------------------------------------------------------------

test("guard approves only an exact member of a clean, non-production allowlist", () => {
  const result = evaluateStagingProjectRef({
    stagingProjectId: APPROVED_REF,
    approvedRefsRaw: `${OTHER_NONPROD_REF}, ${APPROVED_REF}`,
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "approved");
});

test("guard distinguishes each denial code", () => {
  const codeFor = (input) => evaluateStagingProjectRef(input).code;
  assert.equal(codeFor({ stagingProjectId: "", approvedRefsRaw: APPROVED_REF }), "missing-project-id");
  assert.equal(codeFor({ stagingProjectId: "short", approvedRefsRaw: APPROVED_REF }), "malformed-project-id");
  assert.equal(codeFor({ stagingProjectId: PRODUCTION_PROJECT_REF, approvedRefsRaw: APPROVED_REF }), "production-project-id");
  assert.equal(codeFor({ stagingProjectId: APPROVED_REF, approvedRefsRaw: "" }), "missing-allowlist");
  assert.equal(codeFor({ stagingProjectId: APPROVED_REF, approvedRefsRaw: "bad entry" }), "malformed-allowlist");
  assert.equal(
    codeFor({ stagingProjectId: APPROVED_REF, approvedRefsRaw: `${APPROVED_REF},${PRODUCTION_PROJECT_REF}` }),
    "allowlist-contains-production",
  );
  assert.equal(codeFor({ stagingProjectId: OTHER_NONPROD_REF, approvedRefsRaw: APPROVED_REF }), "unapproved-project-id");
});

test("guard never depends on credentials and reads only ref configuration", () => {
  // The decision is a pure function of two non-secret inputs; no service-role key
  // or Management API token is consulted.
  const withJunkSecrets = evaluateStagingProjectRef({
    stagingProjectId: APPROVED_REF,
    approvedRefsRaw: APPROVED_REF,
    SUPABASE_ACCESS_TOKEN: "irrelevant",
    STAGING_DB_PASSWORD: "irrelevant",
  });
  assert.equal(withJunkSecrets.ok, true);
});

test("allowlist parser splits on commas, whitespace and newlines", () => {
  const { refs, malformed } = parseApprovedStagingRefs(`${APPROVED_REF}\n${OTHER_NONPROD_REF},  thirdrefvalue1234567`);
  assert.deepEqual(malformed, []);
  assert.deepEqual(refs, [APPROVED_REF, OTHER_NONPROD_REF, "thirdrefvalue1234567"]);
});
