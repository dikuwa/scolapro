import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import {
  HEADER_FIXTURE,
  fullTermHtml,
  fullTermLayout,
  fullTermModel,
  fullTermPdf,
  layout,
  learnerRow,
  model,
  normalImpactRows,
  weekdaysBetween,
} from "./helpers/register-teacher-harness.mjs";

// Issue #1260 — full-term register corrections.
//
// The register must cover the governed *whole learner term* (not a partial
// as-of cutoff), while never reporting a future day as observed present. The
// expected day counts are always derived from the governed calendar in the
// test, never hard-coded, so a real 65-day term is validated by construction.

// Mirrors the owner's reported Term 3 scenario: 65 school days, last learner
// school day Friday 2026-12-04, as-of today Thursday 2026-11-05.
const START = "2026-09-07"; // Monday
const END = "2026-12-04"; // Friday — exactly 65 weekdays, no closures
const TODAY = "2026-11-05"; // Thursday

function impactRows(overrides = {}) {
  return normalImpactRows(START, END).map((row) => overrides[row.target_date]
    ? { ...row, teaching_impact: overrides[row.target_date] }
    : row);
}

function build(overrides = {}) {
  return model.buildRegisterTeacherDocument({
    mode: "term",
    schoolId: "synthetic-school",
    academicYear: 2026,
    classId: "synthetic-class",
    className: "Grade 6 A",
    gradeName: "Grade 6",
    registerTeacherName: "Fixture Teacher",
    termId: "synthetic-term",
    termName: "Term 3",
    selectedDate: TODAY,
    termStart: START,
    termEnd: END,
    scope: model.resolveRegisterTeacherScope({
      mode: "term", selectedDate: TODAY, termStart: START, termEnd: END,
    }),
    impactRows: impactRows(),
    enrolments: [learnerRow({ id: "b1", learner_id: "b1" })],
    currentRows: [],
    overrideRows: [],
    calendarEventRows: [],
    submissionRows: [],
    fullTerm: { today: TODAY },
    ...overrides,
  });
}

function section(document, sex) {
  return document.sections.find((entry) => entry.sex === sex);
}

async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes);
  let text = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((reference) => doc.context.lookup(reference))
      : [contents];
    const content = streams.filter((stream) => stream instanceof PDFRawStream).map((stream) => {
      const raw = Buffer.from(stream.getContents());
      try { return zlib.inflateSync(raw).toString("latin1"); } catch { return raw.toString("latin1"); }
    }).join("\n");
    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const value = Buffer.from(match[1], "hex").toString("latin1");
      if (/^[\x20-\x7E]+$/.test(value)) text += `${value} `;
    }
  }
  return text;
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function collapse(value) {
  return value.replace(/\s+/g, "");
}

test("#1260 full-term denominator is the governed whole term, not the partial as-of count", () => {
  const document = build();
  const scheduled = weekdaysBetween(START, END).length; // 65
  const elapsed = weekdaysBetween(START, "2026-11-04").length; // strictly before today

  assert.equal(scheduled, 65, "fixture is a real 65-day term");
  assert.equal(document.fullTerm.scheduledTeachingDayCount, scheduled);
  assert.equal(document.fullTerm.includedTeachingDayCount, scheduled);
  // The full-term denominator is strictly larger than the elapsed count, which
  // is exactly the 42-vs-65 style discrepancy #1260 fixes.
  assert.ok(document.fullTerm.includedTeachingDayCount > elapsed);

  const learner = section(document, "male").learners[0];
  assert.equal(learner.termDays, scheduled);
  assert.equal(learner.termAttended + learner.termAbsent, elapsed);
  // Today is not observed until evidence exists, so it is projected alongside
  // the remaining future days.
  assert.equal(learner.termProjected, scheduled - elapsed);
  // Actual present + actual absent + future eligible = full-term possible.
  assert.equal(learner.termAttended + learner.termAbsent + learner.termProjected, learner.termDays);
});

test("#1260 never reports a future school day as observed present", () => {
  const document = build({ fullTerm: { today: TODAY } });
  const learner = section(document, "male").learners[0];
  for (const week of document.weeks) {
    for (const day of week.dates) {
      if (!day.teaching || day.date <= "2026-11-04") continue;
      // Today (2026-11-05) has no explicit evidence, so it and every later day
      // must remain unmarked; only elapsed days default to present.
      assert.equal(learner.marks[day.date] ?? "", "", `future day ${day.date} must not be present`);
    }
  }
  assert.equal(document.fullTerm.status, "provisional");
});

test("#1260 ignores future-dated evidence so a future day is never observed present", () => {
  const futureDate = "2026-11-10"; // Tuesday, after the 2026-11-05 as-of date
  const document = build({
    currentRows: [{ enrolment_id: "b1", attendance_date: futureDate, status: "present", reason_id: null, note: null }],
  });
  const learner = section(document, "male").learners[0];
  assert.equal(learner.marks[futureDate] ?? "", "", "future present evidence must not mark the day");
  // A stray future present row cannot inflate observed attendance.
  const elapsed = weekdaysBetween(START, "2026-11-04").length;
  assert.equal(learner.termAttended + learner.termAbsent, elapsed);
  assert.ok(learner.termProjected > 0);
});

test("#1260 paginated fallback flags an unelapsed full-term balance instead of a false tick", () => {
  const document = build();
  const balance = layout.registerTeacherBalance(section(document, "male"));
  assert.equal(balance.accounted, balance.observed);
  assert.ok(balance.observed < balance.possible);
  // The paginated renderers (including the full-term paginated fallback) print
  // accounted/possible against `balanced`; mid-term that must be an honest "!".
  assert.equal(balance.balanced, false);
  // Only the full-term sheet reconciles observed + projected to the denominator.
  assert.equal(balance.reconciled, true);
});

test("#1260 keeps scheduled (official calendar) distinct from school-included and per-learner possible", () => {
  const officialHoliday = "2026-09-21"; // Monday, official all-learner closure
  const schoolClosure = "2026-09-16"; // Wednesday, school-specific override
  const document = build({
    impactRows: impactRows({ [officialHoliday]: "NO_TEACHING", [schoolClosure]: "NO_TEACHING" }),
    calendarEventRows: [{
      event_scope: "national",
      school_id: null,
      title: "Official public holiday",
      starts_on: officialHoliday,
      ends_on: officialHoliday,
      teaching_impact: "NO_TEACHING",
      audience_scope: "all_learners",
      created_at: "2026-01-01T00:00:00Z",
    }],
    overrideRows: [{ school_date: schoolClosure, reason: "Community closure" }],
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1" }),
      learnerRow({ id: "b2", learner_id: "b2" }),
    ],
  });

  const weekdayCount = weekdaysBetween(START, END).length; // 65
  // Scheduled excludes only the official holiday; the school override reduces
  // the included count further.
  assert.equal(document.fullTerm.scheduledTeachingDayCount, weekdayCount - 1);
  assert.equal(document.fullTerm.includedTeachingDayCount, weekdayCount - 2);
  // Per-learner possible learner-days = included days × learners (all full term).
  assert.equal(document.fullTerm.possibleLearnerDays, (weekdayCount - 2) * 2);
});

test("#1260 school-scoped calendar events reduce included but never the official scheduled count", () => {
  const schoolEvent = "2026-09-23"; // Wednesday
  const document = build({
    impactRows: impactRows({ [schoolEvent]: "NO_TEACHING" }),
    calendarEventRows: [{
      event_scope: "school",
      school_id: "synthetic-school",
      title: "School-specific event",
      starts_on: schoolEvent,
      ends_on: schoolEvent,
      teaching_impact: "NO_TEACHING",
      audience_scope: "all_learners",
      created_at: "2026-01-01T00:00:00Z",
    }],
    overrideRows: [{ school_date: schoolEvent, reason: "School-specific event" }],
  });
  const weekdayCount = weekdaysBetween(START, END).length;
  // A school-scoped event is school-specific: the official scheduled count is
  // unchanged while the included count drops by one.
  assert.equal(document.fullTerm.scheduledTeachingDayCount, weekdayCount);
  assert.equal(document.fullTerm.includedTeachingDayCount, weekdayCount - 1);
});

test("#1260 per-learner possible days honour mid-term admission, early exit and no weekend extras", () => {
  const lateStart = "2026-09-21"; // Monday
  const earlyEnd = "2026-10-16"; // Friday
  const document = build({
    enrolments: [
      learnerRow({ id: "full", learner_id: "full" }),
      learnerRow({ id: "late", learner_id: "late", enrolled_from: lateStart }),
      learnerRow({ id: "early", learner_id: "early", enrolled_to: earlyEnd }),
      learnerRow({ id: "female-full", learner_id: "female-full", sex: "female" }),
    ],
  });

  const byId = new Map(section(document, "male").learners.map((learner) => [learner.learnerId, learner]));
  assert.equal(byId.get("full").termDays, weekdaysBetween(START, END).length);
  assert.equal(byId.get("late").termDays, weekdaysBetween(lateStart, END).length);
  assert.equal(byId.get("early").termDays, weekdaysBetween(START, earlyEnd).length);

  // Ordinary weekends never add a teaching day: each learner's possible days
  // equal the weekdays inside their (term-clamped) enrolment window.
  for (const learner of byId.values()) {
    const from = learner.enrolledFrom < START ? START : learner.enrolledFrom;
    const to = learner.enrolledTo && learner.enrolledTo < END ? learner.enrolledTo : END;
    assert.equal(learner.termDays, weekdaysBetween(from, to).length);
  }
  assert.equal(
    document.fullTerm.possibleLearnerDays,
    document.sections.reduce((sum, entry) => sum + entry.termPossibleTotal, 0),
  );
});

test("#1260 preserves attendance integrity: observed reconciles to elapsed and full-term to elapsed plus projected", () => {
  const document = build({
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1" }),
      learnerRow({ id: "b2", learner_id: "b2" }),
    ],
    currentRows: [
      { enrolment_id: "b1", attendance_date: "2026-09-08", status: "absent", reason_id: "reason", note: null },
    ],
  });
  for (const entry of document.sections) {
    const observed = entry.learners.reduce((sum, learner) => sum + learner.termAttended + learner.termAbsent, 0);
    const projected = entry.learners.reduce((sum, learner) => sum + learner.termProjected, 0);
    const possible = entry.learners.reduce((sum, learner) => sum + learner.termDays, 0);
    assert.equal(entry.termAttendanceTotal + entry.termAbsenceTotal, observed);
    assert.equal(entry.termProjectedTotal, projected);
    assert.equal(observed + projected, possible);
    // The daily observed columns reconcile to the observed (elapsed) possible,
    // never to the full-term denominator.
    assert.equal(Object.values(entry.possibleByDate).reduce((sum, value) => sum + value, 0), entry.possibleTotal);
    assert.equal(entry.possibleTotal, observed);
  }
  const absent = section(document, "male").learners.find((learner) => learner.learnerId === "b1");
  assert.equal(absent.termAbsent, 1);
  assert.ok(absent.reasonedAbsenceDates["2026-09-08"]);

  // Document-level metadata reconciles observed + projected to the denominator.
  assert.ok(document.fullTerm.observedLearnerDays > 0);
  assert.ok(document.fullTerm.projectedLearnerDays > 0);
  assert.equal(
    document.fullTerm.observedLearnerDays + document.fullTerm.projectedLearnerDays,
    document.fullTerm.possibleLearnerDays,
  );
});

test("#1260 separates BOYS and GIRLS onto distinct sheets/pages with clear labels", async () => {
  const document = build({
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1", sex: "male" }),
      learnerRow({ id: "g1", learner_id: "g1", sex: "female" }),
    ],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  assert.equal(plan.sheets.length, 2);
  assert.deepEqual(plan.sheets.map((sheet) => sheet.section.label).sort(), ["BOYS", "GIRLS"]);

  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  // Each gender is its own `.report` section and breaks onto its own page.
  assert.equal((html.match(/class="report full-term-sheet"/g) ?? []).length, 2);
  assert.match(html, /break-after:\s*page/);
  assert.match(html, /BOYS/);
  assert.match(html, /GIRLS/);

  const { bytes, pageCount } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  assert.equal(pageCount, 2);
  const text = await pdfText(bytes);
  assert.match(text, /BOYS/);
  assert.match(text, /GIRLS/);
});

test("#1260 applies a nonzero horizontal inset inside the 32pt print margin in both renderers", async () => {
  const document = build({
    enrolments: [learnerRow({ id: "b1", learner_id: "b1" }), learnerRow({ id: "g1", learner_id: "g1", sex: "female" })],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const inset = fullTermLayout.FULL_TERM_INSET;
  assert.ok(inset > 0, "horizontal inset is nonzero");
  assert.ok(plan.margin >= 32, "print margin honours the 32pt floor");
  for (const sheet of plan.sheets) {
    assert.equal(sheet.inset, inset);
    const paper = fullTermLayout.FULL_TERM_PAPERS[sheet.paper];
    assert.ok(Math.abs(sheet.contentWidth - (paper.width - plan.margin * 2 - inset * 2)) < 0.01);
    // The grid therefore starts at least 32pt + inset from the paper edge.
    assert.ok(plan.margin + sheet.inset >= 32 + inset - 0.001);
  }

  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, new RegExp(`\\.report\\s*\\{[^}]*padding:\\s*0\\s+${inset}pt`));
  assert.match(html, new RegExp(`@page \\{ size: [^;]+; margin:${plan.margin}pt; \\}`));
});

test("#1260 keeps the footer tight beneath the bottom summary and inside the inset", async () => {
  const document = build({
    enrolments: [learnerRow({ id: "b1", learner_id: "b1" }), learnerRow({ id: "g1", learner_id: "g1", sex: "female" })],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);

  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  // The footer sits immediately under the balance strip (1pt top padding), not
  // floating away from the bottom summary.
  assert.match(html, /\.sheet-foot\s*\{[^}]*padding:1pt 1pt 0/);
  assert.match(html, /\.balance-strip/);

  const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  const text = await pdfText(bytes);
  assert.match(text, /A2 landscape|A1 landscape/);
  assert.match(text, /Provisional/);
});

test("#1260 renders real A2/A1 PDF pages within bounds with HTML/PDF/print parity", async () => {
  const document = build({
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1" }),
      learnerRow({ id: "g1", learner_id: "g1", sex: "female" }),
    ],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const paper = fullTermLayout.FULL_TERM_PAPERS[plan.paper];

  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, new RegExp(`@page \\{ size: ${paper.width}pt ${paper.height}pt; margin:${plan.margin}pt; \\}`));

  const { bytes, pageCount } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  assert.equal(pageCount, 2);
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - paper.width) < 1);
    assert.ok(Math.abs(page.getHeight() - paper.height) < 1);
  }

  const text = await pdfText(bytes);
  const possible = String(document.fullTerm.possibleLearnerDays);
  // The governed possible learner-days figure appears in both renderings.
  assert.ok(collapse(stripHtml(html)).includes(collapse(possible)));
  assert.ok(collapse(text).includes(collapse(possible)));
  assert.match(text, /PROVISIONAL/);
  assert.match(text, /Full-term/);
});

test("#1260 is non-mutating and stays provisional without authoritative evidence", () => {
  const base = build();
  const scope = {
    schoolId: "synthetic-school",
    classId: "synthetic-class",
    termId: "synthetic-term",
    cutoff: base.fullTerm.closingDate,
  };
  const id1 = fullTermModel.computeFullTermExportSnapshotId({ ...scope, document: base });
  const id2 = fullTermModel.computeFullTermExportSnapshotId({ ...scope, document: build() });
  assert.equal(id1, id2, "identical inputs produce the same export snapshot");
  assert.equal(base.fullTerm.status, "provisional");

  const changed = build({
    currentRows: [{ enrolment_id: "b1", attendance_date: "2026-09-08", status: "absent", reason_id: null, note: null }],
  });
  assert.notEqual(fullTermModel.computeFullTermExportSnapshotId({ ...scope, document: changed }), id1);
  assert.equal(changed.fullTerm.status, "provisional");
});

test("#1260 route keeps the opt-in full-term mode and paginated fallback wiring", () => {
  const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
  assert.match(route, /requestedMode === "full-term"/);
  assert.match(route, /planRegisterTeacherFullTermDocument\(document\)/);
  assert.match(route, /The unchanged paginated term register is shown instead/);
  assert.match(route, /renderRegisterTeacherFullTermHtml/);
  assert.match(route, /renderRegisterTeacherFullTermPdf/);
});

// --- Control Room presentation remediation (2026-11-05) -------------------
// These cover the four items the Control Room authorised after the dual
// ACCEPT WITH NITS review: the replacement-Saturday explanation, explicit
// summary bases, the stale empty-state wording and out-of-term closing dates
// on a term with no eligible day.

test("#1260 explains a school-opened replacement Saturday instead of printing a contradictory total", () => {
  const saturday = "2026-09-12";
  assert.equal(new Date(`${saturday}T12:00:00Z`).getUTCDay(), 6, "fixture opens a real Saturday");

  const document = build({
    impactRows: [...impactRows(), { target_date: saturday, teaching_impact: "NORMAL" }],
    overrideRows: [{ school_date: saturday, reason: "School open day (replacement Saturday)" }],
  });

  // The official Mon-Fri baseline is unchanged; the school adds one day.
  assert.equal(document.fullTerm.scheduledTeachingDayCount, 65);
  assert.equal(document.fullTerm.includedTeachingDayCount, 66);

  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, /65 scheduled school days/);
  assert.match(html, /66 school-included teaching days \(1 school-added replacement day\)/);
  assert.match(html, /66 included \/ 65 scheduled/);
  assert.doesNotMatch(html, /66 \/ 65/);

  const learner = section(document, "male").learners[0];
  assert.equal(learner.termDays, 66);
  assert.equal(learner.termAttended + learner.termAbsent + learner.termProjected, 66);
});

test("#1260 states a net school closure count without inventing replacement days", () => {
  const document = build({
    calendarEventRows: [{
      title: "School closure",
      starts_on: "2026-10-14",
      ends_on: "2026-10-14",
      event_scope: "school",
      created_at: "2026-01-01T00:00:00Z",
    }],
    impactRows: impactRows({ "2026-10-14": "NO_TEACHING" }),
  });
  assert.equal(document.fullTerm.scheduledTeachingDayCount, 65);
  assert.equal(document.fullTerm.includedTeachingDayCount, 64);

  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, /64 school-included teaching days \(1 school non-teaching day\)/);
});

test("#1260 labels the observed and full-term summary bases in the printed document", async () => {
  const document = build({
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1", sex: "male" }),
      learnerRow({ id: "g1", learner_id: "g1", sex: "female" }),
    ],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const label = "Total possible attendances (daily/week = observed; term = full term)";

  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.ok(collapse(stripHtml(html)).includes(collapse(label)), "HTML carries the explicit basis label");

  const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  const text = await pdfText(bytes);
  assert.ok(collapse(text).includes(collapse(label)), "PDF carries the explicit basis label");
});

test("#1260 empty-state copy no longer claims an on-or-before-today boundary", () => {
  const noTeaching = weekdaysBetween(START, END).map((date) => ({ target_date: date, teaching_impact: "NO_TEACHING" }));
  const document = build({ impactRows: noTeaching });

  assert.equal(document.fullTerm.closingDate, null);
  assert.equal(document.fullTerm.includedTeachingDayCount, 0);

  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, /the governed learner term contains no eligible teaching day/);
  assert.doesNotMatch(html, /on or before/);
});

test("#1260 rejects an out-of-term closing date even when the term has no eligible day", () => {
  const noTeaching = weekdaysBetween(START, END).map((date) => ({ target_date: date, teaching_impact: "NO_TEACHING" }));

  assert.throws(
    () => build({ impactRows: noTeaching, fullTerm: { today: TODAY, closingDate: "2027-01-15" } }),
    (error) => error instanceof fullTermModel.RegisterTeacherFullTermError && error.status === 400,
    "an out-of-term closing date is a 400, not a silently empty sheet",
  );
  assert.throws(
    () => build({ impactRows: noTeaching, fullTerm: { today: TODAY, closingDate: "2026-09-06" } }),
    (error) => error instanceof fullTermModel.RegisterTeacherFullTermError && error.status === 400,
  );

  // An in-term date stays valid and still renders the explicit empty state.
  const inTerm = build({ impactRows: noTeaching, fullTerm: { today: TODAY, closingDate: "2026-10-01" } });
  assert.equal(inTerm.fullTerm.closingDate, "2026-10-01");
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(inTerm);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document: inTerm, plan });
  assert.match(html, /NO ELIGIBLE SCHOOL DAY/);
  assert.match(html, /contains no eligible teaching day/);
});

test("#1260 does not claim a term has no teaching days when only the closing date is empty", () => {
  // The first three term days are non-teaching, so an explicit closing date
  // before them yields an empty view even though the rest of the term teaches.
  const document = build({
    impactRows: impactRows({
      "2026-09-07": "NO_TEACHING",
      "2026-09-08": "NO_TEACHING",
      "2026-09-09": "NO_TEACHING",
    }),
    fullTerm: { today: TODAY, closingDate: "2026-09-09" },
  });

  assert.equal(document.fullTerm.includedTeachingDayCount, 0);
  assert.ok(document.fullTerm.scheduledTeachingDayCount > 0, "the term still has scheduled teaching days");

  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, /No eligible teaching day falls on or before the selected closing date/);
  assert.doesNotMatch(html, /governed learner term contains no eligible teaching day/);
});
