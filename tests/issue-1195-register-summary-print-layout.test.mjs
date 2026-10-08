import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summary = readFileSync(new URL("../src/features/attendance/official-summary.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../src/features/attendance/server/render-register-teacher-html.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/features/attendance/server/official-summary.ts", import.meta.url), "utf8");

test("weekly uses the term summary's compact total and sex breakdown", () => {
  assert.match(summary, /function Split\(/);
  assert.match(summary, /\{value\.boys\}B \/ \{value\.girls\}G/);
  const weekly = summary.split("function WeekTable(")[1].split("function TermTable(")[0];
  assert.match(weekly, /<Split value=\{row\.daily\.find/);
  assert.match(weekly, /<Split value=\{schoolSplit\(day\.date\)\}/);
  assert.match(weekly, /summary\.classRows\.reduce/);
  assert.match(weekly, /total\.boys \+=/);
  assert.match(weekly, /total\.girls \+=/);
});

test("weekly school total never manufactures per-sex values from the overall count", () => {
  const weekly = summary.split("function WeekTable(")[1].split("function TermTable(")[0];
  assert.doesNotMatch(weekly, /boys: 0, girls: 0, total: week\?\.absentLearnerDays/);
});

test("registers fit paper width and divide long terms into week panels", () => {
  assert.match(register, /table-layout:fixed/);
  assert.match(register, /min-width:0; border-collapse:collapse/);
  assert.match(register, /<colgroup>\$\{columns\}<\/colgroup>/);
  assert.match(register, /document\.weeks\.length > 3/);
  assert.match(register, /document\.weeks\.slice\(i \* 3, \(i \+ 1\) \* 3\)/);
  assert.match(register, /sectionHtml\(document, section, weeks, i \+ 1, panels\.length\)/);
  assert.doesNotMatch(register, /min-width:max-content/);
  assert.doesNotMatch(register, /overflow-x:auto/);
});

test("register panels retain school context, names, boys girls and totals", () => {
  assert.match(register, /<strong>BOYS\/GIRLS:<\/strong>/);
  assert.match(register, /<strong>REGISTER CLASS:<\/strong>/);
  assert.match(register, /<strong>REGISTER TEACHER:<\/strong>/);
  assert.match(register, /learnerIdentityCells\(section, index\)/);
  assert.match(register, /totalsRow\("Total number of possible attendances"/);
  assert.match(register, /@page \{ size:A3 landscape; margin:8mm; \}/);
});

test("term class splits sum all authoritative class-date buckets through weeks", () => {
  assert.match(server, /for \(const split of classWeekly\.get\(item\.id\)\?\.values\(\) \?\? \[\]\)/);
  assert.match(server, /total\.boys \+= split\.boys/);
  assert.match(server, /total\.girls \+= split\.girls/);
  assert.match(server, /total\.total \+= split\.total/);
  assert.doesNotMatch(server, /absentByClassDate\.get\(item\.id\)/);
});

test("weekly summary selector displays the selected week before any teaching day resolves", () => {
  assert.match(summary, /const displayedWeekDate = summary\.lastTeachingDate \?\?/);
  assert.match(summary, /mondayFor\(date\)/);
  assert.match(summary, /value\.setDate\(value\.getDate\(\) \+ 4\)/);
  assert.match(summary, /longDateFormatter\.format\(new Date\(/);
  assert.doesNotMatch(summary, /const lastReportedOn = summary\.lastTeachingDate \? .* : "—"/);
});

test("weekly summary displays all five weekdays while term retains weekly columns", () => {
  const weekly = summary.split("function WeekTable(")[1].split("function TermTable(")[0];
  const term = summary.split("function TermTable(")[1];
  assert.match(weekly, /\["M", "T", "W", "T", "F"\]/);
  assert.match(weekly, /length: 5/);
  assert.match(weekly, /row\.daily\.find/);
  assert.match(weekly, /schoolSplit\(day\.date\)/);
  assert.match(term, /week\.weekLabel/);
  assert.match(server, /absentByClassDate\.get\(\`\$\{item\.id\}:\$\{day\}\`\)/);
});
