import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261002094500_curriculum_official_resource_registry.sql", "utf8");
const server = readFileSync("src/features/teaching/server/curriculum-access.ts", "utf8");
const workspace = readFileSync("src/features/teaching/curriculum-access-workspace.tsx", "utf8");

test("official education registry extends the canonical curriculum model", () => {
  assert.match(migration, /create table public\.curriculum_version_applicability/i);
  assert.match(migration, /create table public\.official_education_resources/i);
  assert.match(migration, /create table public\.official_education_resource_applicability/i);
  assert.match(migration, /create table public\.official_education_resource_curriculum_links/i);
  assert.match(migration, /create table public\.school_subject_curriculum_mappings/i);
  assert.doesNotMatch(migration, /create table public\.curriculum_(?:database|registry)_v2/i);
});

test("resolver is deterministic and never uses fuzzy display-name matching", () => {
  assert.match(migration, /resolve_curriculum_version_for_subject_offering/);
  assert.match(migration, /resolution_state/);
  assert.match(migration, /'none'/);
  assert.match(migration, /'matched'/);
  assert.match(migration, /'ambiguous'/);
  assert.match(migration, /lower\(btrim\(m\.grade_code\)\)=lower\(btrim\(p_grade_code\)\)/i);
  assert.doesNotMatch(migration, /similarity\s*\(/i);
  assert.doesNotMatch(migration, /levenshtein/i);
  assert.doesNotMatch(migration, /display_name\s+(?:ilike|like)/i);
});

test("historical pins are preserved and only unpinned offerings can adopt", () => {
  assert.match(migration, /if v_offering\.curriculum_version_id is not null then\s+return v_offering\.curriculum_version_id;/i);
  assert.match(migration, /where id=v_offering\.id\s+and curriculum_version_id is null;/i);
  assert.match(migration, /before insert on public\.subject_offerings/i);
  assert.match(migration, /subject_offering_curriculum_pin_guard_trg/);
  assert.match(migration, /Pinned subject-offering curriculum version is immutable/);
});

test("national definitions remain platform-governed and publication is provenance-gated", () => {
  assert.match(migration, /platform admins manage official education resources/i);
  assert.match(migration, /app_private\.has_platform_role\(array\['platform_admin'\]\)/i);
  assert.match(migration, /status not in \('published','superseded'\)/i);
  assert.match(migration, /checksum is not null/i);
  assert.match(migration, /approved_by_user_id is not null/i);
  assert.match(migration, /Published official education resource content and provenance are immutable/i);
  assert.match(migration, /old\.approved_at is not null/i);
  assert.match(migration, /v_old_final/i);
  assert.match(migration, /v_new_final/i);
});

test("teacher curriculum access exposes source links, official resources and practicals", () => {
  assert.match(server, /sourceUrl: source\.source_url/);
  assert.match(server, /from\("curriculum_practicals"\)/);
  assert.match(server, /from\("official_education_resource_curriculum_links"\)/);
  assert.match(server, /unitsByAllocationId/);
  assert.match(server, /resourcesByAllocationId/);
  assert.match(server, /applicable_grade_keys/);
  assert.match(server, /from\("official_education_resource_applicability"\)/);
  assert.match(server, /from\("school_subject_curriculum_mappings"\)/);
  assert.match(server, /candidateMappings\.length === 1/);
  assert.match(workspace, /Open official source/);
  assert.match(workspace, /Official companion resources/);
  assert.match(workspace, /Practical requirements/);
  assert.match(workspace, /Open resource/);
});

test("source gate stays explicit", () => {
  assert.match(workspace, /Source gate preserved/);
  assert.match(workspace, /does not scrape, invent, upload or relabel NIED content/);
  assert.match(workspace, /Draft extraction and review candidates remain platform-governed/);
});
