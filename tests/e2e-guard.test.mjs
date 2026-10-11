import { test } from "node:test";
import assert from "node:assert/strict";
import {
  E2EEnvironmentError,
  PRODUCTION_PROJECT_REF,
  e2eEnvironmentRejection,
  isProductionHost,
  resolveE2EEnvironment,
  supabaseProjectRefFromUrl,
} from "../e2e/support/env-guard.mjs";

const STAGING_REF = "abcdefghijklmnopqrst";

test("defaults to a safe loopback local target", () => {
  const env = resolveE2EEnvironment({});
  assert.equal(env.target, "local");
  assert.equal(env.baseUrl, "http://localhost:3000");
  assert.equal(env.production, false);
});

test("accepts a loopback target backed by the local Supabase stack", () => {
  const env = resolveE2EEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
  assert.equal(env.target, "local");
  assert.equal(env.supabaseProjectRef, null);
});

test("refuses the production Vercel alias", () => {
  assert.throws(
    () => resolveE2EEnvironment({ PLAYWRIGHT_BASE_URL: "https://scola-pro.vercel.app" }),
    E2EEnvironmentError,
  );
});

test("refuses any Vercel host", () => {
  assert.throws(
    () => resolveE2EEnvironment({ PLAYWRIGHT_BASE_URL: "https://scolapro-preview.vercel.app" }),
    E2EEnvironmentError,
  );
});

test("refuses the production Supabase project ref", () => {
  assert.throws(
    () =>
      resolveE2EEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      }),
    E2EEnvironmentError,
  );
});

test("refuses a local target pointed at a hosted Supabase project", () => {
  assert.throws(
    () =>
      resolveE2EEnvironment({
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3000",
        NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      }),
    E2EEnvironmentError,
  );
});

test("refuses a local target on a non-loopback host", () => {
  assert.throws(
    () =>
      resolveE2EEnvironment({
        SCOLAPRO_E2E_TARGET: "local",
        PLAYWRIGHT_BASE_URL: "https://attendance.example.test",
      }),
    E2EEnvironmentError,
  );
});

test("staging requires an explicit project ref", () => {
  assert.throws(
    () =>
      resolveE2EEnvironment({
        SCOLAPRO_E2E_TARGET: "staging",
        PLAYWRIGHT_BASE_URL: "https://staging.scolapro.test",
      }),
    E2EEnvironmentError,
  );
});

test("staging requires the synthetic-only acknowledgement", () => {
  assert.throws(
    () =>
      resolveE2EEnvironment({
        SCOLAPRO_E2E_TARGET: "staging",
        PLAYWRIGHT_BASE_URL: "https://staging.scolapro.test",
        SCOLAPRO_E2E_SUPABASE_PROJECT_REF: STAGING_REF,
      }),
    E2EEnvironmentError,
  );
});

test("staging still refuses the production ref", () => {
  assert.throws(
    () =>
      resolveE2EEnvironment({
        SCOLAPRO_E2E_TARGET: "staging",
        PLAYWRIGHT_BASE_URL: "https://staging.scolapro.test",
        SCOLAPRO_E2E_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
        SCOLAPRO_E2E_SYNTHETIC_ONLY: "1",
      }),
    E2EEnvironmentError,
  );
});

test("staging accepts an explicit non-production ref with synthetic-only", () => {
  const env = resolveE2EEnvironment({
    SCOLAPRO_E2E_TARGET: "staging",
    PLAYWRIGHT_BASE_URL: "https://staging.scolapro.test",
    SCOLAPRO_E2E_SUPABASE_PROJECT_REF: STAGING_REF,
    SCOLAPRO_E2E_SYNTHETIC_ONLY: "1",
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
  });
  assert.equal(env.target, "staging");
  assert.equal(env.supabaseProjectRef, STAGING_REF);
  assert.equal(env.production, false);
});

test("rejection helper returns null when safe and a reason when unsafe", () => {
  assert.equal(e2eEnvironmentRejection({}), null);
  assert.match(
    e2eEnvironmentRejection({ PLAYWRIGHT_BASE_URL: "https://scola-pro.vercel.app" }) ?? "",
    /production/i,
  );
});

test("host and project-ref helpers behave as documented", () => {
  assert.equal(isProductionHost("scola-pro.vercel.app"), true);
  assert.equal(isProductionHost("localhost"), false);
  assert.equal(supabaseProjectRefFromUrl(`https://${STAGING_REF}.supabase.co`), STAGING_REF);
  assert.equal(supabaseProjectRefFromUrl("http://127.0.0.1:54321"), null);
  assert.equal(supabaseProjectRefFromUrl("not a url"), null);
});
