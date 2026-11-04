#!/usr/bin/env node
// CLI entry point for the fail-closed staging project-ref gate.
//
// Runs as the FIRST step of `.github/workflows/staging-database.yml`, before the
// Supabase CLI is installed and before any `supabase link`/`migration`/`db push`
// command. It reads only non-secret configuration and performs no network call.
//
// Exits 0 only when the candidate ref is an explicitly approved staging project.
// Exits 1 (fail-closed) otherwise, printing a sanitized reason. No Supabase CLI
// command is ever invoked by this script.

import {
  APPROVED_REFS_ENV,
  STAGING_PROJECT_ID_ENV,
  evaluateStagingProjectRef,
} from "./lib/staging-project-ref-guard.mjs";

const result = evaluateStagingProjectRef({
  stagingProjectId: process.env[STAGING_PROJECT_ID_ENV],
  approvedRefsRaw: process.env[APPROVED_REFS_ENV],
});

if (!result.ok) {
  console.error(`::error::Refusing staging database workflow: ${result.message}`);
  console.error(
    `Staging project-ref gate denied (${result.code}); no Supabase CLI command was run.`,
  );
  process.exit(1);
}

console.log(`Approved staging project ref: ${result.message}`);
