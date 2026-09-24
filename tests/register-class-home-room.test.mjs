import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Issue #701 — Register Class -> Home Room relationship.
// Verifies the canonical relationship stays optional, effective, same-school
// scoped, and advisory about shared rooms without hard-coding one-class-per-room.
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20260923200000_register_class_home_room.sql");
const pgtap = read("supabase/tests/register_class_home_room_test.sql");
const structure = read("src/features/academics/server/structure.ts");
const actions = read("src/features/academics/server/actions.ts");
const createForms = read("src/features/academics/structure-forms.tsx");
const classManagement = read("src/features/academics/class-management.tsx");
const setupPage = read("src/app/school/setup/page.tsx");

test("1. home_room_id is an optional, non-cascading relationship on register classes", () => {
  assert.match(migration, /alter table public\.register_classes/);
  assert.match(migration, /add column if not exists home_room_id uuid references public\.school_rooms\(id\) on delete set null/);
  // Historical register-to-room assignments must survive room deletion/renumbering.
  assert.doesNotMatch(migration, /home_room_id[^;]*on delete cascade/i);
});

test("2. no second room model is introduced and register teacher stays a separate domain", () => {
  const sql = migration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /create table/i);
  assert.doesNotMatch(sql, /register_teacher_staff_id\s*=/);
  // Custodian inheritance (#702) is out of scope for #701: no custodian column,
  // function, trigger or policy may be introduced by this migration.
  assert.doesNotMatch(sql, /custodian/i);
});

test("3. one-class-per-room is not hard-coded (shared rooms stay possible)", () => {
  assert.doesNotMatch(migration, /unique\s*\([^)]*home_room_id/i);
  assert.doesNotMatch(migration, /create unique index[^;]*home_room_id/i);
  assert.match(migration, /create index if not exists register_classes_home_room_idx/);
});

test("4. writes are scope-guarded for same school and same tenant, including direct SQL", () => {
  assert.match(migration, /app_private\.enforce_home_room_scope/);
  assert.match(migration, /v_tenant <> new\.tenant_id or v_school <> new\.school_id/);
  assert.match(migration, /Home room must belong to the same school and tenant as the register class/);
  // The trigger must cover plain INSERT/UPDATE so the RPC is not the only gate.
  assert.match(migration, /before insert or update of home_room_id, school_id, tenant_id/);
  assert.match(migration, /revoke all on function app_private\.enforce_home_room_scope\(\) from public, anon, authenticated/);
});

test("5. upsert/update RPCs validate the room and keep the previous value auditable", () => {
  assert.match(migration, /create or replace function public\.upsert_register_class\(/);
  assert.match(migration, /create or replace function public\.update_register_class\(/);
  assert.match(migration, /p_home_room_id uuid default null/);
  assert.match(migration, /previous_home_room_id/);
  assert.match(migration, /grant execute on function public\.upsert_register_class\(uuid,integer,uuid,text,text,uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.update_register_class\(uuid,uuid,text,text,uuid\) to authenticated/);

test("7. structure read model resolves the home room for display and keeps classes intact", () => {
  assert.match(structure, /home_room_id/);
  assert.match(structure, /home_rooms:home_room_id!left\(id,room_code,display_name,block_name\)/);
  assert.match(structure, /\.eq\("school_id", schoolId\)/);
  assert.match(structure, /homeRoom:/);
  assert.doesNotMatch(structure, /service_role|createClient\(/);
});

test("8. the home room control is a searchable ScolaPro Picker, not a native select", () => {
  for (const source of [createForms, classManagement]) {
    assert.match(source, /import \{ Picker \} from "@\/components\/ui\/picker"/);
    assert.match(source, /label="Home room"/);
    assert.match(source, /searchable/);
    assert.match(source, /searchPlaceholder="Search rooms"/);
    assert.doesNotMatch(source, /<select/);
  }
});

test("9. duplicate active room use warns instead of blocking, and never corrupts data", () => {
  assert.match(createForms, /sharedRoomWarning/);
  assert.match(classManagement, /classHomeRoomWarning/);
  assert.match(createForms, /already uses this home room\. Shared rooms are allowed/);
  assert.match(classManagement, /already uses this home room\. Shared rooms are allowed/);
  // Warning is advisory only: no submit is disabled by it and it performs no write.
  assert.doesNotMatch(createForms, /disabled=\{[^}]*sharedRoomWarning/);
  assert.doesNotMatch(classManagement, /disabled=\{[^}]*classHomeRoomWarning/);
  assert.doesNotMatch(createForms, /sharedRoomWarning[\s\S]{0,200}?(?:\.insert\(|\.update\(|\.rpc\()/);
  assert.doesNotMatch(classManagement, /classHomeRoomWarning[\s\S]{0,200}?(?:\.insert\(|\.update\(|\.rpc\()/);
  // The edit form excludes the class being edited so re-saving never warns about itself.
  assert.match(classManagement, /item\.id !== editingClassId/);
});

test("10. the warning uses theme tokens and announces itself for assistive technology", () => {
  for (const source of [createForms, classManagement]) {
    assert.match(source, /role="status"/);
    assert.match(source, /bg-warning-soft\/60/);
    assert.match(source, /text-\[color:var\(--warning\)\]/);
    assert.match(source, /TriangleAlert/);
  }
});

test("11. the setup page keeps school-scoped rooms and passes classes for conflict detection", () => {
  assert.match(setupPage, /rooms=\{rooms\} classes=\{structure\.classes\}/);
  assert.match(setupPage, /classes=\{structure\.classes\} rooms=\{rooms\}/);
  assert.match(setupPage, /canManageAcademicStructure \? listSchoolRooms\(membership\.schoolId\) : Promise\.resolve\(\[\]\)/);
});

test("12. pgTAP covers denial, historical change, shared rooms and preserved behaviour", () => {
  assert.match(pgtap, /select plan\(19\)/);
  assert.match(pgtap, /cross-school room assignment is denied at the RPC/);
  assert.match(pgtap, /trigger enforces scope on direct INSERT \(cross-tenant\)/);
  assert.match(pgtap, /register class home room can be cleared/);
  assert.match(pgtap, /home room reference survives room renumbering/);
  assert.match(pgtap, /shared-room arrangement is permitted: more than one class can reference the same room/);
  assert.match(pgtap, /unauthenticated user cannot upsert a register class/);
  assert.match(pgtap, /register class code and name can be updated without touching home room/);
  assert.match(pgtap, /register class can be created without a home room \(optional\)/);
  // Assertions must be deterministic inside one transaction: audit rows are
  // scoped by entity, and class codes compared case-insensitively because the
  // pre-existing update RPC upper-cases codes while upsert lower-cases them.
  assert.doesNotMatch(pgtap, /order by occurred_at desc limit 1/);
  assert.match(pgtap, /and entity_id = \(select id from public\.register_classes where lower\(class_code\)='7b'\)/);
  assert.doesNotMatch(pgtap, /where class_code='/);
  assert.match(pgtap, /set local role authenticated/);
});

  assert.doesNotMatch(migration, /grant execute[^;]*(?:to public|to anon)/);
});

test("6. server actions forward the optional home room without dropping register-class behaviour", () => {
  assert.match(actions, /homeRoomId: z\.string\(\)\.uuid\("Choose a room\."\)\.optional\(\)\.or\(z\.literal\(""\)\)/);
  assert.match(actions, /p_home_room_id: parsed\.data\.homeRoomId \|\| null/);
  assert.match(actions, /p_class_code: normalizeCode\(parsed\.data\.classCode\)/);
  assert.match(actions, /p_display_name: parsed\.data\.displayName/);
  // Both create and update accept the field.
  assert.equal((actions.match(/p_home_room_id: parsed\.data\.homeRoomId \|\| null/g) ?? []).length, 2);
});
