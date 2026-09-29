import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260929121500_operational_file_shared_resources.sql",
  "utf8",
);
const resolver = readFileSync(
  "src/features/teaching/server/operational-file-resolvers.ts",
  "utf8",
);
const resources = readFileSync(
  "src/features/teaching/server/operational-file-shared-resources.ts",
  "utf8",
);

test("shared-resource foundation is reference-only and reuses existing teacher documents", () => {
  assert.match(migration, /create table public\.operational_file_resources/);
  assert.match(migration, /teacher_document_id uuid references public\.teacher_professional_documents/);
  assert.match(migration, /external_url text/);
  assert.doesNotMatch(migration, /storage\.buckets/);
  assert.doesNotMatch(migration, /storage\.objects/);
});

test("resource scopes and authority provenance are explicit", () => {
  assert.match(migration, /'national','school','subject_phase','teacher'/);
  assert.match(migration, /'platform','school','subject','private'/);
  assert.match(migration, /provider text not null/);
  assert.match(migration, /authority_label text not null/);
  assert.match(migration, /academic_year integer/);
  assert.match(migration, /grade_from smallint/);
  assert.match(migration, /grade_to smallint/);
  assert.match(migration, /effective_from date/);
  assert.match(migration, /effective_to date/);
});

test("external resources are HTTPS-only and Drive/OneDrive are not treated specially", () => {
  assert.match(migration, /external_url is null or external_url ~\* '\^https:\/\/'/);
  assert.match(migration, /External operational resource URL must use HTTPS/);
  assert.doesNotMatch(migration, /drive\.google\.com/);
  assert.doesNotMatch(migration, /onedrive\.live\.com/);
});

test("one resource can bind to many operational-file requirements", () => {
  assert.match(migration, /create table public\.operational_file_resource_bindings/);
  assert.match(migration, /primary key\(resource_id,template_item_id\)/);
  assert.match(migration, /foreach v_item_id in array p_template_item_ids/);
});

test("read authority is current-school and teacher-private scope aware", () => {
  assert.match(migration, /user_current_school_matches\(auth\.uid\(\),r\.school_id\)/);
  assert.match(migration, /hod_responsible_for_subject\(r\.school_id,r\.subject_id\)/);
  assert.match(migration, /user_owns_operational_file_resource/);
  assert.match(migration, /platform_admin','platform_support/);
});

test("authenticated clients cannot directly mutate shared-resource tables", () => {
  assert.match(migration, /grant select on public\.operational_file_resources to authenticated/);
  assert.match(migration, /grant select on public\.operational_file_resource_bindings to authenticated/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]*operational_file_resources to authenticated/i);
});

test("shared-resource resolver batches references and keeps RLS as the data boundary", () => {
  assert.match(resources, /operational_file_resource_bindings/);
  assert.match(resources, /\.in\("template_item_id", ids\)/);
  assert.match(resources, /academic_year/);
  assert.match(resources, /effectiveOn/);
  assert.doesNotMatch(resources, /service_role/);
  assert.doesNotMatch(resources, /createAdmin/);
});

test("canonical resolver consumes bound shared and external resources", () => {
  assert.match(resolver, /getOperationalFileSharedResourceReferences/);
  assert.match(resolver, /sharedResourceResult\("shared_resource"\)/);
  assert.match(resolver, /sharedResourceResult\("external_link"\)/);
  assert.match(resolver, /sharedResourceResult\("teacher_document"\)/);
  assert.match(resolver, /templateItemIds: input\.items\.map\(\(item\) => item\.id\)/);
  assert.match(resolver, /No applicable shared resource is recorded for this template item\./);
});
