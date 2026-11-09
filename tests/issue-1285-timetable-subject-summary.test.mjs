import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/features/timetable/subject-maintenance-list.tsx", import.meta.url), "utf8");

test("#1285 configured subjects are previewed without expanding their edit controls", () => {
  assert.match(source, /<details className="group mt-4/);
  assert.match(source, /<summary className="cursor-pointer/);
  assert.match(source, /data-subject-preview/);
  assert.match(source, /subjects\.slice\(0, 5\)/);
  assert.match(source, /subjects\.length > 5/);
  assert.match(source, /subjects\.length - 5/);
  assert.match(source, /group-open:hidden/);
  assert.match(source, /data-subject-maintenance/);
  assert.ok(source.indexOf("data-subject-preview") < source.indexOf("data-subject-maintenance"));
  assert.match(source, /subjects\.map\(\(subject\) => <SubjectRow/);
  assert.doesNotMatch(source, /<ConfigurationCard/);
});

test("#1285 existing governed edit and retirement workflow stays scoped per subject", () => {
  for (const expression of [
    /updateSubject/, /retireSubject/, /onEdit/, /onClose/,
    /subjectId/, /aria-invalid/, /Save correction/,
    /Delete unused subject/, /Archive subject/,
    /role="alert"/, /subject\.used/,
  ]) assert.match(source, expression);
});
