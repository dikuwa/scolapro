import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const action = read("src/components/ui/record-action-button.tsx");
const sports = read("src/features/sports-houses/sports-houses-workspace.tsx");
const library = read("src/features/library/catalog-manager.tsx");
const conductPolicy = read("src/features/conduct/policy-settings.tsx");
const conductCategory = read("src/features/conduct/category-settings.tsx");
const plan = read("src/features/timetable/timetable-plan-management.tsx");
const rooms = read("src/features/timetable/room-management.tsx");
const subjects = read("src/features/timetable/subject-maintenance-list.tsx");
const guardians = read("src/features/guardians/guardian-panel.tsx");
const learner = read("src/features/learners/learner-profile-editor.tsx");
const directory = read("src/features/school-directory/school-directory-workspace.tsx");
const classes = read("src/features/academics/class-management.tsx");

test("record action button supports accessible icon-only edit affordances", () => {
  assert.match(action, /iconOnly\?: boolean/);
  assert.match(action, /aria-label=\{ariaLabel \?\? \(iconOnly \? label : undefined\)\}/);
  assert.match(action, /title=\{iconOnly \? label : undefined\}/);
  assert.match(action, /iconOnly && "size-8 min-h-8 shrink-0 p-0"/);
  assert.match(action, /className=\{iconOnly \? "sr-only" : undefined\}/);
});

test("record action continues to compose the canonical Button design system", () => {
  assert.match(action, /import \{ Button, type ButtonProps \} from "@\/components\/ui\/button"/);
  assert.match(action, /variant\?: ButtonProps\["variant"\]/);
  assert.match(action, /<Button/);
});

test("sports houses and library use the canonical edit entry action", () => {
  assert.match(sports, /<RecordActionButton icon=\{Pencil\} label="Edit"/);
  assert.match(library, /<RecordActionButton icon=\{Pencil\} label="Edit"/);
  assert.match(sports, /setEditingHouseId\(null\)/);
  assert.match(sports, /setEditingAgeGroupId\(null\)/);
  assert.match(sports, /<ChevronDown className="size-4" \/>Close/);
});

test("conduct edit entry actions use the canonical edit affordance", () => {
  assert.match(conductPolicy, /<RecordActionButton icon=\{Pencil\} label="Edit group"/);
  assert.match(conductPolicy, /<RecordActionButton icon=\{Pencil\} label="Edit" variant="ghost"/);
  assert.match(conductCategory, /<RecordActionButton icon=\{Pencil\} label="Edit"/);
});

test("timetable record edit entry actions share the canonical affordance", () => {
  assert.match(plan, /<RecordActionButton icon=\{PencilLine\} label="Edit dates"/);
  assert.match(rooms, /<RecordActionButton icon=\{Pencil\} label=\{\`Edit \$\{room\.name\}\`\} iconOnly/);
  assert.match(subjects, /<RecordActionButton icon=\{Pencil\} label=\{\`Edit \$\{subject\.name\}\`\} iconOnly/);
});

test("guardian learner directory and academic records use canonical edit entry actions", () => {
  assert.match(guardians, /<RecordActionButton icon=\{Pencil\} label=\{\`Edit contact details for \$\{guardian\.name\}\`\} iconOnly/);
  assert.match(learner, /<RecordActionButton icon=\{Pencil\} label="Edit learner"/);
  assert.match(directory, /<RecordActionButton icon=\{Pencil\} label="Edit inspector contact"/);
  assert.match(classes, /<RecordActionButton icon=\{Pencil\} label=\{\`Edit \$\{grade\.name\}\`\} iconOnly/);
  assert.match(classes, /<RecordActionButton icon=\{Pencil\} label=\{\`Edit \$\{item\.name\}\`\} iconOnly/);
});

test("create close save update and destructive controls remain semantically separate", () => {
  assert.match(directory, /<Plus[^>]*\/> Add inspector contact/);
  assert.match(learner, /<X[^>]*\/> Close edit/);
  assert.match(rooms, /Trash2/);
  assert.match(subjects, /Trash2/);
  assert.match(classes, /Delete \$\{grade\.name\}/);
});
