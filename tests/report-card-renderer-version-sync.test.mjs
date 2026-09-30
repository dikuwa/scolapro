import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migrationsDirectory = new URL("supabase/migrations/", root);

const extractApplicationRendererVersion = (source) => {
  const match = source.match(
    /REPORT_CARD_RENDERER_VERSION\s*=\s*"(SCOLAPRO_TERM_REPORT_RENDERER_V\d+)"/,
  );
  assert.ok(match, "application constant must declare a report-card renderer revision");
  return match[1];
};

const extractDatabaseRendererVersion = (source, context) => {
  const match = source.match(
    /create or replace function app_private\.current_report_card_renderer_version\(\)[\s\S]*?as \$\$\s*select '(SCOLAPRO_TERM_REPORT_RENDERER_V\d+)'::text;\s*\$\$;/,
  );
  assert.ok(match, `${context} must declare a report-card renderer revision`);
  return match[1];
};

test("application and database report-card renderer revisions stay synchronized", async () => {
  const applicationSource = await readFile(
    new URL("src/features/reporting/server/report-card-renderer-version.ts", root),
    "utf8",
  );
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const rendererMigrations = [];
  for (const name of migrationNames) {
    const source = await readFile(new URL(name, migrationsDirectory), "utf8");
    if (source.includes("create or replace function app_private.current_report_card_renderer_version()")) {
      rendererMigrations.push({ name, source });
    }
  }

  assert.ok(rendererMigrations.length > 0, "a database renderer migration must exist");
  const currentDatabaseMigration = rendererMigrations.at(-1);
  const applicationVersion = extractApplicationRendererVersion(applicationSource);
  const databaseVersion = extractDatabaseRendererVersion(
    currentDatabaseMigration.source,
    currentDatabaseMigration.name,
  );

  assert.equal(databaseVersion, applicationVersion);
  assert.doesNotMatch(
    currentDatabaseMigration.source,
    /\b(?:update|delete\s+from|truncate)\s+public\.report_card_(?:render_jobs|documents)\b/i,
    "renderer bumps must not rewrite historical jobs or artifacts",
  );
  assert.match(
    currentDatabaseMigration.source,
    /revoke all on function app_private\.current_report_card_renderer_version\(\)[\s\S]*from public, anon, authenticated;/,
  );
  assert.match(
    currentDatabaseMigration.source,
    /grant execute on function app_private\.current_report_card_renderer_version\(\)[\s\S]*to service_role;/,
  );
});
