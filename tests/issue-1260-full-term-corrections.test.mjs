import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import {
  COMPLETE_HEADER_FIXTURE,
  COMPLETE_SCHOOL_PROFILE,
  HEADER_FIXTURE,
  fullTermHtml,
  fullTermLayout,
  fullTermModel,
  fullTermPdf,
  headerBuilder,
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
  // The footer caption shares the balance strip's row, so it cannot float away
  // from the bottom summary or sit below the red totals.
  assert.match(html, /\.sheet-footer-row\s*\{[^}]*align-items:baseline/);
  assert.match(html, /\.sheet-foot\s*\{[^}]*flex:1 1 320pt/);
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

test("#1260 does not claim a term has no teaching days when only the closing date is empty", async () => {
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
  // The remedy must match the diagnosis: this is a closing-date choice, not a
  // missing governed school day.
  assert.match(html, /Choose a later closing date/);
  assert.doesNotMatch(html, /Configure or open a governed school day before printing/);

  // The branch is duplicated in the PDF renderer, so assert it there too.
  // PDF text extraction drops spaces, so compare collapsed strings.
  const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  const text = collapse(await pdfText(bytes));
  assert.ok(text.includes(collapse("No eligible teaching day falls on or before the selected closing date")));
  assert.ok(!text.includes(collapse("The governed learner term contains no eligible teaching day")));
  assert.ok(text.includes(collapse("Choose a later closing date")));
});

test("#1260 renders every configured school identity field in the full-term header", async () => {
  const document = build();
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const expected = [
    "Fixture Secondary School",
    "(Fixture Combined School)",
    "EMIS: EMIS-0001",
    "Address: 12 Independence Avenue, Windhoek",
    "Postal / town: Private Bag 5001, Windhoek",
    "Tel: +264 61 000 0000",
    "Fax: +264 61 000 0001",
    "Email: office@fixture-secondary.example",
  ];

  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: COMPLETE_HEADER_FIXTURE, document, plan });
  const htmlText = collapse(stripHtml(html));
  for (const value of expected) {
    assert.ok(htmlText.includes(collapse(value)), `HTML header is missing "${value}"`);
  }
  assert.match(html, /class="school-logo"/, "HTML header renders the configured crest");

  const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: COMPLETE_HEADER_FIXTURE, document, plan });
  const pdfTextValue = collapse(await pdfText(bytes));
  for (const value of expected.slice(1)) {
    assert.ok(pdfTextValue.includes(collapse(value)), `PDF header is missing "${value}"`);
  }
  // The school name is drawn with the configured Old English face, which is a
  // subset-encoded font, so it cannot be recovered from the text operators. It
  // is asserted through the document title and the embedded crest instead.
  const rendered = await PDFDocument.load(bytes);
  assert.match(rendered.getTitle() ?? "", /Fixture Secondary School/);
  assert.ok(
    Buffer.from(bytes).toString("latin1").includes("/Subtype /Image"),
    "PDF header embeds the configured crest",
  );
});

test("#1260 omits unconfigured school identity fields instead of inventing them", () => {
  const header = headerBuilder.buildOfficialDocumentHeaderModel({
    ...COMPLETE_SCHOOL_PROFILE,
    physicalAddress: "",
    postalAddress: "",
    town: "",
    telephone: "",
    fax: "",
    email: "",
  }, { mode: "internal_school" });
  const document = build();
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = stripHtml(fullTermHtml.renderRegisterTeacherFullTermHtml({ header, document, plan }));

  assert.match(html, /Fixture Secondary School/);
  assert.match(html, /EMIS-0001/);
  for (const label of ["Address:", "Postal / town:", "Tel:", "Fax:", "Email:"]) {
    assert.ok(!html.includes(label), `unconfigured ${label} must not be printed`);
  }
});

test("#1260 places the footer caption and the balance totals on one row", async () => {
  const document = build();
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });

  const rowStart = html.indexOf('<div class="sheet-footer-row">');
  assert.ok(rowStart > -1, "the sheet renders a shared footer row");
  const row = html.slice(rowStart, html.indexOf("</section>", rowStart));
  assert.match(row, /class="sheet-foot"/);
  assert.match(row, /class="balance-strip"/);
  assert.ok(
    row.indexOf('class="sheet-foot"') < row.indexOf('class="balance-strip"'),
    "the caption is the left cell and the red totals are the right cell",
  );
  assert.match(row, /Days column = full-term possible/);

  const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  const text = collapse(await pdfText(bytes));
  assert.ok(text.includes(collapse("Days = full-term possible (incl. projected)")));
  assert.ok(text.includes(collapse("Present")) && text.includes(collapse("Full-term")));
});

test("#1260 dynamically excludes October 5 once and honours effective reopening", () => {
  for (const [closed, expected] of [[[], 65], [["2026-10-05"], 64], [["2026-10-05", "2026-10-14"], 63]]) {
    const document = build({ officialLearnerDayCount: 65, impactRows: impactRows(Object.fromEntries(closed.map(date => [date, "NO_TEACHING"]))),
      calendarEventRows: closed.map(date => ({ event_scope: "school", title: "Governed holiday", starts_on: date, ends_on: date, created_at: date })) });
    assert.equal(document.fullTerm.includedTeachingDayCount, expected);
    assert.equal(document.sections[0].learners[0].termDays, expected);
    for (const date of closed) {
      assert.equal(document.sections[0].learners[0].marks[date], "");
      assert.equal(document.sections[0].possibleByDate[date], 0);
      assert.equal(document.sections[0].attendanceByDate[date], 0);
      assert.equal(document.sections[0].absenceByDate[date], 0);
      assert.equal(document.weeks.flatMap(w => w.dates).find(d => d.date === date).teaching, false);
    }
    const audit = fullTermModel.fullTermCalendarAudit(document.fullTerm);
    assert.match(audit, /Official published school days: 65/);
    assert.equal(audit.includes("totals differ"), expected !== 65);
  }
  const reopened = build({ calendarEventRows: [{ event_scope: "school", title: "Holiday", starts_on: "2026-10-05", ends_on: "2026-10-05", created_at: START }],
    overrideRows: [{ school_date: "2026-10-05", reason: "Authorized reopening" }] });
  assert.equal(reopened.fullTerm.includedTeachingDayCount, 65);
  assert.equal(reopened.sections[0].learners[0].marks["2026-10-05"], "I");
});

for (const count of [0, 1, 35, 90]) test(`#1261 full closure band without numeric markers (${count} learners)`, async () => {
  const reason = "International Teachers Day (School Holiday)";
  const document = build({ impactRows: impactRows({ "2026-10-05": "NO_TEACHING" }), overrideRows: [{ school_date: "2026-10-05", reason }], enrolments: Array.from({ length: count }, (_, i) => learnerRow({ id: `b${i}`, sex: "male" })) });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.ok(html.includes(`<span class="closure-label">${reason}</span>`));
  assert.ok(!html.includes('class="closure-index"'));
  assert.ok(!html.includes('class="closure-notes-row"'));
  if (count) assert.ok(html.includes(`rowspan="${count}"`));
  assert.equal(document.fullTerm.includedTeachingDayCount, 64);
  for (const learner of document.sections[0].learners) assert.equal(learner.marks["2026-10-05"], "");
  const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  assert.ok(collapse(await pdfText(bytes)).includes(collapse(reason)));
});


test("#1264 full-term browser displays real sheet boundaries without altering print page geometry", () => {
  const document = build({ impactRows: impactRows({ "2026-10-05": "NO_TEACHING" }) });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.equal((html.match(/class="report full-term-sheet"/g) ?? []).length, 2);
  assert.match(html, /@media screen \{[\s\S]*?min-height:calc\([\d.]+pt - 64pt\);/);
  assert.match(html, /outline:1px solid #aab4c2;/);
  assert.match(html, /margin:0 auto 28px;/);
  assert.match(html, /@media print \{[\s\S]*?break-after:page; page-break-after:always;/);
  assert.match(html, /\.report:last-child \{ break-after:auto; page-break-after:auto; \}/);
  assert.match(html, /@page \{ size: (1683\.78pt 1190\.55pt|2383\.94pt 1683\.78pt); margin:32pt; \}/);
});

test("#1264 document preview controls show pointer and honest action feedback", () => {
  const actions = readFileSync("src/components/documents/official-document-actions.tsx", "utf8");
  assert.match(actions, /cursor-pointer/);
  assert.match(actions, /disabled:cursor-not-allowed/);
  assert.match(actions, /aria-busy=\{printing\}/);
  assert.match(actions, /Opening print…/);
  assert.match(actions, /Starting PDF…/);
  assert.match(actions, /CloseAction[^\n]*cursor-pointer/);
});


test("#1266 an early 09 Sep closing date keeps day cells compact and leaves paper to the right", async () => {
  const document = build({ fullTerm: { today: TODAY, closingDate: "2026-09-09" } });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  assert.equal(document.fullTerm.closingDate, "2026-09-09");
  assert.equal(document.fullTerm.includedTeachingDayCount, 3);
  assert.deepEqual(document.weeks.flatMap(week => week.dates.map(day => day.date)),
    ["2026-09-07", "2026-09-08", "2026-09-09"]);
  for (const sheet of plan.sheets) {
    assert.ok(sheet.dayWidth <= fullTermLayout.FULL_TERM_COMPACT_DAY_WIDTH);
    assert.ok(sheet.dayWidth >= fullTermLayout.FULL_TERM_MIN_DAY_WIDTH);
    assert.ok(sheet.tableWidth < sheet.contentWidth * 0.65);
    const identity = sheet.identityWidths.reduce((a, b) => a + b, 0);
    const totals = sheet.termWidths.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sheet.tableWidth - (identity + totals + sheet.dayWidth * 3 + sheet.weekTotalWidth)) < 0.01);
  }
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.ok(html.includes(`<table style="width:${plan.sheets[0].tableWidth.toFixed(2)}pt">`));
  assert.ok(!html.includes('>10 Sep 2026<'));
  assert.equal((html.match(/class="report full-term-sheet"/g) ?? []).length, 2);
  const { bytes, pageCount } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  assert.equal(pageCount, 2);
  assert.ok(bytes.length > 0);
});

test("#1266 normal full-term sheet still uses the entire planned horizontal grid", () => {
  const document = build();
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  for (const sheet of plan.sheets) assert.ok(Math.abs(sheet.tableWidth - sheet.contentWidth) < 0.01);
});

test("#1266 excluded closing-day and single-day partial term keep compact grid and governed counts", () => {
  for (const closingDate of ["2026-09-07", "2026-09-09", "2026-10-05"]) {
    const document = build({
      fullTerm: { today: TODAY, closingDate },
      impactRows: impactRows({ "2026-09-09": "NO_TEACHING", "2026-10-05": "NO_TEACHING" }),
    });
    const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
    assert.equal(plan.fits, true);
    const dates = document.weeks.flatMap(week => week.dates);
    assert.ok(dates.every(day => day.date <= closingDate));
    assert.ok(plan.sheets.every(sheet => sheet.dayWidth <= fullTermLayout.FULL_TERM_COMPACT_DAY_WIDTH));
    if (closingDate === "2026-09-09") assert.equal(document.fullTerm.includedTeachingDayCount, 2);
    if (closingDate === "2026-09-07") assert.equal(document.fullTerm.includedTeachingDayCount, 1);
  }
});


test("#1268 historical 12 Oct cutoff is cumulative and future term weekdays are not labelled closures", async () => {
  const cutoff = "2026-10-12";
  const first = "2026-09-07";
  const historicAbsence = "2026-09-15";
  const document = build({
    fullTerm: { today: TODAY, closingDate: cutoff },
    impactRows: impactRows({ "2026-10-05": "NO_TEACHING" }),
    overrideRows: [{ school_date: "2026-10-05", reason: "School holiday" }],
    currentRows: [{ enrolment_id: "b1", attendance_date: historicAbsence, status: "absent", reason_id: null, note: null }],
  });
  const dates = document.weeks.flatMap(week => week.dates.map(day => day.date));
  assert.equal(dates[0], first);
  assert.equal(dates[dates.length - 1], cutoff);
  assert.ok(dates.includes(historicAbsence));
  assert.ok(!dates.some(day => day > cutoff));
  assert.equal(document.fullTerm.includedTeachingDayCount, 25);
  assert.equal(document.fullTerm.scheduledTeachingDayCount, 26);
  assert.equal(document.fullTerm.termEligibleTeachingDayCount, 64);
  assert.equal(document.fullTerm.weekdayBaseline, 65);
  assert.equal(section(document, "male").learners[0].marks[historicAbsence], "a");
  assert.equal(section(document, "male").learners[0].termDays, 25);
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.match(html, /26 scheduled school days/);
  assert.match(html, /25 school-included teaching days \(1 school non-teaching day\)/);
  assert.doesNotMatch(html, /40 school non-teaching days/);
  const { pageCount } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  assert.equal(pageCount, 2);
});

test("#1268 closing calendar picker and inline preview preserve cumulative view state", () => {
  const workspace = readFileSync("src/features/attendance/register-teacher-workspace.tsx", "utf8");
  const inline = readFileSync("src/features/attendance/inline-register-document-panel.tsx", "utf8");
  assert.match(workspace, /import \{ DateField \} from "@\/components\/ui\/date-field"/);
  assert.match(workspace, /label="Closing date"/);
  assert.match(workspace, /min=\{selectedTerm\?\.startsOn \?\? undefined\}/);
  assert.match(workspace, /max=\{selectedTerm\?\.endsOn \?\? undefined\}/);
  assert.match(workspace, /Last eligible school day/);
  assert.doesNotMatch(workspace, /const closingDateOptions =/);
  assert.match(workspace, /navigate\(\{ closingDate: value \|\| null \}\)/);
  assert.match(inline, /key=\{state\.requestKey\}/);
});
