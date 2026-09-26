import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const teachingPage = await read("src/app/teaching/page.tsx");
const workspace = await read("src/features/teaching/teaching-workspace.tsx");
const curriculum = await read("src/app/teaching/curriculum/page.tsx");
const files = await read("src/app/teaching/files/page.tsx");
const reviews = await read("src/app/teaching/reviews/page.tsx");
const navigation = await read("src/components/shell/navigation.tsx");

test("Teaching remains one primary navigation entry while the workspace exposes governed tools", () => {
  assert.match(navigation, /key: "teaching", label: "Teaching", href: "\/teaching"/);
  assert.doesNotMatch(navigation, /href: "\/teaching\/(?:planning|curriculum|preparation|coverage|files|reviews)"/);

  for (const href of [
    "/teaching/planning",
    "/teaching/curriculum",
    "/teaching/preparation",
    "/teaching/coverage",
    "/teaching/files",
    "/teaching/reviews",
    "/teaching/oversight",
  ]) {
    assert.match(teachingPage, new RegExp(href.replaceAll("/", "\\/")));
  }

  assert.match(workspace, /from "next\/link"/);
  assert.match(workspace, /aria-label="Teaching tools"/);
});

test("Teaching tool entry points derive capabilities from all current-school memberships", () => {
  assert.match(teachingPage, /schoolMemberships = context\.memberships\.filter/);
  assert.match(teachingPage, /roleKeys = new Set\(schoolMemberships\.map/);
  assert.match(teachingPage, /staffTeachingMembership = schoolMemberships\.find/);
  assert.match(teachingPage, /preparationMembership = schoolMemberships\.find/);
  assert.match(teachingPage, /planningHref=\{canPlan \? "\/teaching\/planning" : null\}/);
  assert.match(teachingPage, /curriculumHref=\{staffTeachingMembership \? "\/teaching\/curriculum" : null\}/);
  assert.match(teachingPage, /preparationHref=\{preparationMembership \? "\/teaching\/preparation" : null\}/);
  assert.match(teachingPage, /filesHref=\{staffTeachingMembership \? "\/teaching\/files" : null\}/);
  assert.match(teachingPage, /reviewHref=\{canReview \? "\/teaching\/reviews" : null\}/);
  assert.match(teachingPage, /oversightHref=\{canUseOversight \? "\/teaching\/oversight" : null\}/);
  assert.match(workspace, /label: "Teaching oversight"/);
});

test("dedicated teaching tools use the governed academic year", () => {
  for (const source of [curriculum, files, reviews]) {
    assert.match(source, /getGovernedAcademicYear/);
    assert.doesNotMatch(source, /getNamibiaCalendarYear/);
    assert.doesNotMatch(source, /new Date\(\)\.getFullYear\(\)/);
  }
  assert.match(curriculum, /await getGovernedAcademicYear\(membership\.schoolId\)/);
  assert.match(files, /await getGovernedAcademicYear\(membership\.schoolId\)/);
  assert.match(reviews, /await getGovernedAcademicYear\(scope\.schoolId\)/);
});

test("workspace copy reflects the now-connected operational tools", () => {
  assert.doesNotMatch(workspace, /once the governed preparation editor is connected/);
  assert.doesNotMatch(workspace, /This entry point will connect to it/);
  assert.match(workspace, /dedicated Lesson preparation tool above/);
  assert.match(workspace, /Coverage & reflection tool above to record new actuals/);
  assert.match(workspace, /Teaching files are available/);
});
