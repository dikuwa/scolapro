import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLD_PROJECTION, digestWorld } from "../e2e/support/seed-digest.mjs";

function world(overrides = {}) {
  return {
    tenants: [{ id: "t1", name: "Demo", slug: "demo", updated_at: "2026-01-01T00:00:00Z" }],
    schools: [{ id: "s1", tenant_id: "t1", name: "Namib High School", emis_number: "DEMO001", region: "Erongo", town: "Swakopmund" }],
    register_classes: [
      { id: "c1", tenant_id: "t1", school_id: "s1", grade_id: "g1", academic_year: 2026, class_code: "10A", display_name: "Grade 10/A", register_teacher_staff_id: "st1" },
      { id: "c2", tenant_id: "t1", school_id: "s1", grade_id: "g1", academic_year: 2026, class_code: "10B", display_name: "Grade 10/B", register_teacher_staff_id: null },
    ],
    ...overrides,
  };
}

test("digest is stable across row order", () => {
  const a = digestWorld(world());
  const b = digestWorld(
    world({ register_classes: [...world().register_classes].reverse() }),
  );
  assert.equal(a, b);
});

test("digest is stable across repeated computation", () => {
  assert.equal(digestWorld(world()), digestWorld(world()));
});

test("digest ignores non-projected columns such as updated_at", () => {
  const before = digestWorld(world());
  const after = digestWorld(
    world({ tenants: [{ id: "t1", name: "Demo", slug: "demo", updated_at: "2030-12-31T23:59:59Z" }] }),
  );
  assert.equal(before, after, "row-version columns must not affect the fixture digest");
});

test("digest changes when a projected value changes", () => {
  const before = digestWorld(world());
  const after = digestWorld(
    world({ schools: [{ id: "s1", tenant_id: "t1", name: "Different School", emis_number: "DEMO001", region: "Erongo", town: "Swakopmund" }] }),
  );
  assert.notEqual(before, after);
});

test("digest changes when a fixture row is removed", () => {
  const before = digestWorld(world());
  const after = digestWorld(world({ register_classes: [world().register_classes[0]] }));
  assert.notEqual(before, after);
});

test("digest of a missing table equals the digest of an empty table", () => {
  assert.equal(digestWorld({}), digestWorld({ learners: [] }));
});

test("world projection covers the seeded fixture tables", () => {
  for (const table of [
    "tenants",
    "schools",
    "grades",
    "register_classes",
    "learners",
    "enrolments",
    "staff_members",
    "school_memberships",
    "staff_school_assignments",
    "school_day_overrides",
    "user_profiles",
  ]) {
    assert.ok(Array.isArray(WORLD_PROJECTION[table]) && WORLD_PROJECTION[table].length > 0, `${table} must be projected`);
  }
});
