import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts } from "pdf-lib";
import {
  HEADER_FIXTURE,
  fullTermHtml,
  fullTermLayout,
  fullTermModel,
  fullTermPdf,
  learnerRow,
  model,
  normalImpactRows,
} from "./helpers/register-teacher-harness.mjs";

const START = "2026-01-12";
const END = "2026-04-24";
const CLOSURE = "2026-01-14";

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
    termName: "Term 1",
    selectedDate: "2026-01-16",
    termStart: START,
    termEnd: END,
    scope: model.resolveRegisterTeacherScope({
      mode: "term", selectedDate: "2026-01-16", termStart: START, termEnd: END,
    }),
    impactRows: impactRows({ [CLOSURE]: "NO_TEACHING" }),
    enrolments: [],
    currentRows: [],
    overrideRows: [{ school_date: CLOSURE, reason: "Synthetic community closure" }],
    calendarEventRows: [],
    submissionRows: [],
    fullTerm: { today: "2026-01-18" },
    ...overrides,
  });
}

function boys(document) {
  return document.sections.find(({ sex }) => sex === "male");
}

function girls(document) {
  return document.sections.find(({ sex }) => sex === "female");
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

function collapseWs(value) {
  return value.replace(/\s+/g, "");
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ");
}

/**
 * Prove no planned closure continuation line can cross the 32pt printable
 * inset: every line, measured with the real Helvetica font, is no wider than
 * the content box, and the planned band rectangle encloses every drawn line.
 */
async function assertClosureBandWithinInset(plan) {
  const measureDoc = await PDFDocument.create();
  const regular = await measureDoc.embedFont(StandardFonts.Helvetica);
  const size = 7;
  const linePitch = size * 1.18;
  for (const sheet of plan.sheets) {
    const continuation = sheet.closureNotes.filter((note) => note.continuation);
    const maxWidth = Math.max(20, sheet.contentWidth - 16);
    let totalLines = 0;
    for (const note of continuation) {
      for (const line of note.lines) {
        const lineWidth = regular.widthOfTextAtSize(line, size);
        assert.ok(lineWidth <= maxWidth + 0.5, `closure line fits content width: ${line.slice(0, 24)}…`);
        totalLines += 1;
      }
    }
    // Drawn band height = title (6+7) + gap (4) + lines*pitch + inter-note gaps (2).
    const drawnHeight = 17 + 4 + totalLines * linePitch + Math.max(0, continuation.length - 1) * 2;
    assert.ok(drawnHeight <= sheet.closureBandHeight + 0.5, "planned band encloses every continuation line");
  }
}

test("full-term closing date defaults to the last eligible day and accepts a non-teaching boundary", () => {
  const byDefault = build();
  assert.equal(byDefault.fullTerm.closingDate, "2026-01-16");
  assert.equal(byDefault.fullTerm.includedTeachingDayCount, 4);
  assert.equal(byDefault.fullTerm.status, "provisional");
  const explicit = build({ fullTerm: { today: "2026-01-18", closingDate: "2026-01-14" } });
  assert.equal(explicit.fullTerm.closingDate, "2026-01-14");
  assert.equal(explicit.fullTerm.includedTeachingDayCount, 2);
  assert.ok(explicit.weeks.flatMap(({ dates }) => dates).every(({ date }) => date <= "2026-01-14"));
});

test("full-term closing date rejects impossible, outside-term and future dates", () => {
  for (const closingDate of ["2026-02-30", "2026-01-11", "2026-01-19", "2026-04-25"]) {
    assert.throws(
      () => build({ fullTerm: { today: "2026-01-18", closingDate } }),
      /closing date|learner term|school-local/i,
    );
  }
});

test("full-term has an explicit empty state before the first eligible day", () => {
  const empty = build({ fullTerm: { today: "2026-01-11" } });
  assert.equal(empty.fullTerm.closingDate, null);
  assert.equal(empty.fullTerm.includedTeachingDayCount, 0);
  assert.equal(empty.weeks.length, 0);
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(empty);
  assert.equal(plan.fits, true);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document: empty, plan });
  assert.match(html, /NO ELIGIBLE SCHOOL DAY/);
});

test("full-term counts closures, absence evidence and default-present only for past eligible days", () => {
  const document = build({
    enrolments: [
      learnerRow({ id: "present", learner_id: "present" }),
      learnerRow({ id: "absent", learner_id: "absent" }),
      learnerRow({ id: "today", learner_id: "today" }),
    ],
    currentRows: [
      { enrolment_id: "absent", attendance_date: "2026-01-13", status: "absent", reason_id: "reason", note: null },
      { enrolment_id: "today", attendance_date: "2026-01-16", status: "present", reason_id: null, note: null },
    ],
    fullTerm: { today: "2026-01-16" },
  });
  const section = boys(document);
  assert.equal(section.possibleByDate[CLOSURE], 0);
  assert.equal(section.possibleByDate["2026-01-15"], 3);
  // 2026-01-16 is today: only the learner with explicit evidence contributes.
  assert.equal(section.possibleByDate["2026-01-16"], 1);
  for (const learner of section.learners) {
    assert.equal(learner.termAttended + learner.termAbsent, learner.termDays);
  }
  assert.equal(section.termAttendanceTotal + section.termAbsenceTotal, section.termPossibleTotal);
  const absent = section.learners.find(({ learnerId }) => learnerId === "absent");
  assert.equal(absent.termAbsent, 1);
  assert.ok(absent.reasonedAbsenceDates["2026-01-13"]);
});

test("full-term preserves disjoint re-entry and fails closed on ambiguous overlap", () => {
  const reentry = build({
    enrolments: [
      learnerRow({ id: "first", learner_id: "returning", enrolled_to: "2026-01-13" }),
      learnerRow({ id: "return", learner_id: "returning", enrolled_from: "2026-01-16" }),
      learnerRow({ id: "transfer", sex: "female", enrolled_from: "2026-01-15" }),
    ],
  });
  // Disjoint re-entry stays as two separate enrolment rows until authoritative
  // identity evidence permits a merge; no eligible learner-day is double-counted.
  assert.equal(boys(reentry).learners.length, 2);
  assert.equal(boys(reentry).learners.reduce((sum, learner) => sum + learner.termDays, 0), 3);
  assert.equal(girls(reentry).learners.length, 1);

  assert.throws(() => build({
    enrolments: [
      learnerRow({ id: "first", learner_id: "duplicate", enrolled_to: "2026-01-16" }),
      learnerRow({ id: "second", learner_id: "duplicate", enrolled_from: "2026-01-16", enrolled_to: "2026-01-20" }),
    ],
  }), /Overlapping enrolments/i);
});

test("full-term stays provisional unless evidence matches the exact exported snapshot", () => {
  const scope = { schoolId: "school", classId: "class", termId: "term", cutoff: "2026-01-16" };
  const expected = fullTermModel.computeFullTermExportSnapshotId(scope);

  // A school-only summary cannot certify a class register, even with a valid id.
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "school", classId: null, termId: "term", cutoff: "2026-01-16", snapshotId: expected },
  }).status, "provisional");

  // Mismatched cutoff.
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "school", classId: "class", termId: "term", cutoff: "2026-01-15", snapshotId: expected },
  }).status, "provisional");

  // Different school.
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "other-school", classId: "class", termId: "term", cutoff: "2026-01-16", snapshotId: expected },
  }).status, "provisional");

  // FABRICATED snapshot: scope matches but the id was not derived from it.
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "school", classId: "class", termId: "term", cutoff: "2026-01-16", snapshotId: "snapshot" },
  }).status, "provisional");

  // STALE snapshot: id derived from a different closing date.
  const staleId = fullTermModel.computeFullTermExportSnapshotId({ ...scope, cutoff: "2026-01-15" });
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "school", classId: "class", termId: "term", cutoff: "2026-01-16", snapshotId: staleId },
  }).status, "provisional");

  // UNRELATED snapshot: id derived from a different class.
  const unrelatedId = fullTermModel.computeFullTermExportSnapshotId({ ...scope, classId: "other-class" });
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "school", classId: "class", termId: "term", cutoff: "2026-01-16", snapshotId: unrelatedId },
  }).status, "provisional");

  // Exact match certifies.
  assert.equal(fullTermModel.resolveFullTermCertification({
    scope,
    evidence: { schoolId: "school", classId: "class", termId: "term", cutoff: "2026-01-16", snapshotId: expected },
  }).status, "certified");

  // A non-class-scoped document stays provisional.
  const document = build({ certificationEvidence: { schoolId: "synthetic-school", classId: null, termId: "synthetic-term", cutoff: "2026-01-16", snapshotId: "snapshot" } });
  assert.equal(document.fullTerm.status, "provisional");
});

test("weekly and paginated term outputs are unchanged by the full-term option", () => {
  const week = model.buildRegisterTeacherDocument({
    mode: "week",
    schoolId: "synthetic-school",
    academicYear: 2026,
    classId: "synthetic-class",
    className: "Grade 6 A",
    gradeName: "Grade 6",
    registerTeacherName: "Fixture Teacher",
    termId: "synthetic-term",
    termName: "Term 1",
    selectedDate: "2026-01-16",
    termStart: START,
    termEnd: END,
    scope: model.resolveRegisterTeacherScope({ mode: "week", selectedDate: "2026-01-16", fromWeek: "2026-01-12", termStart: START, termEnd: END }),
    impactRows: impactRows(),
    enrolments: [learnerRow({ id: "one" })],
    currentRows: [],
    overrideRows: [],
    calendarEventRows: [],
    submissionRows: [],
  });
  assert.equal(week.fullTerm, undefined);
  assert.equal(week.scopeEnd, "2026-01-16");
  assert.equal(week.weeks.length, 1);
  const term = build({ fullTerm: undefined, selectedDate: "2026-01-16" });
  assert.equal(term.fullTerm, undefined);
  assert.equal(term.scopeEnd, "2026-01-16");
  assert.equal(term.teachingDayCount, normalImpactRows(START, END).length - 1);
});

test("full-term A2/A1 sheets cover 0/1/40+ learners, 40-70+ dates and two genders", async () => {
  const longTerm = build({ fullTerm: { today: END }, impactRows: impactRows() });
  assert.ok(longTerm.fullTerm.includedTeachingDayCount >= 40);
  for (const count of [0, 1, 46]) {
    const document = build({
      fullTerm: { today: END },
      impactRows: impactRows({ [CLOSURE]: "NO_TEACHING" }),
      enrolments: Array.from({ length: count }, (_, index) => learnerRow({
        id: `learner-${index}`,
        learner_id: `learner-${index}`,
        sex: index % 2 === 0 ? "male" : "female",
      })),
    });
    const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
    assert.equal(plan.fits, true, `synthetic ${count}-learner term should fit supported paper`);
    assert.equal(plan.sheets.length, 2);
    assert.ok(plan.margin >= 32);
    assert.ok(["a2", "a1"].includes(plan.paper));
    for (const sheet of plan.sheets) {
      assert.ok(sheet.fonts.data >= 8);
      assert.ok(sheet.fonts.heading >= 7);
      assert.ok(sheet.dayWidth >= 10);
      assert.ok(sheet.rowHeight >= 10);
      assert.ok(sheet.width > sheet.height);
    }
    const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
    assert.match(html, /BOYS/);
    assert.match(html, /GIRLS/);
    assert.match(html, /PROVISIONAL/);
    assert.match(html, /Synthetic community closure/);
    const { bytes, pageCount } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
    assert.equal(pageCount, 2);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (const page of pdf.getPages()) {
      assert.ok(Math.abs(page.getWidth() - plan.width) < 1);
      assert.ok(Math.abs(page.getHeight() - plan.height) < 1);
    }
    const text = await pdfText(bytes);
    assert.match(text, /BOYS/);
    assert.match(text, /GIRLS/);
    assert.match(text, /PROVISIONAL/);
  }
});

test("full-term preserves complete long closure text or falls back explicitly", async () => {
  const longName = `Community closure ${"X".repeat(900)}`;
  const document = build({
    fullTerm: { today: "2026-01-18" },
    enrolments: [learnerRow({ id: "one" })],
    overrideRows: [{ school_date: CLOSURE, reason: longName }],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  if (plan.fits) {
    const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
    assert.ok(collapseWs(stripHtml(html)).includes(collapseWs(longName)), "html carries the full closure text unbroken");
    const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
    assert.ok(collapseWs(await pdfText(bytes)).includes(collapseWs(longName)), "pdf carries the full closure text unbroken");
    await assertClosureBandWithinInset(plan);
  } else {
    assert.ok(plan.reason);
  }

  // A very large closure that still fits a single sheet must keep every
  // character in both renderings and stay within the printable inset.
  const bigName = `Regional educational infrastructure closure ${"Z".repeat(20000)}`;
  const big = build({
    fullTerm: { today: "2026-01-18" },
    enrolments: [learnerRow({ id: "one" })],
    overrideRows: [{ school_date: CLOSURE, reason: bigName }],
  });
  const bigPlan = fullTermLayout.planRegisterTeacherFullTermDocument(big);
  if (bigPlan.fits) {
    const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document: big, plan: bigPlan });
    assert.ok(collapseWs(stripHtml(html)).includes(collapseWs(bigName)), "html carries the 20k closure text unbroken");
    const { bytes } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document: big, plan: bigPlan });
    assert.ok(collapseWs(await pdfText(bytes)).includes(collapseWs(bigName)), "pdf carries the 20k closure text unbroken");
    await assertClosureBandWithinInset(bigPlan);
  } else {
    assert.ok(bigPlan.reason);
  }

  const extreme = build({
    fullTerm: { today: "2026-01-18" },
    enrolments: [learnerRow({ id: "one" })],
    overrideRows: [{ school_date: CLOSURE, reason: "Y".repeat(116016) }],
  });
  const extremePlan = fullTermLayout.planRegisterTeacherFullTermDocument(extreme);
  assert.equal(extremePlan.fits, false);
  assert.match(extremePlan.reason, /cannot fit/i);
});

test("full-term gender and learner balances reconcile without re-summing weekly subtotals", () => {
  const document = build({
    fullTerm: { today: "2026-01-18" },
    enrolments: [
      learnerRow({ id: "b1", learner_id: "b1" }),
      learnerRow({ id: "b2", learner_id: "b2" }),
      learnerRow({ id: "g1", learner_id: "g1", sex: "female" }),
    ],
    currentRows: [
      { enrolment_id: "b1", attendance_date: "2026-01-13", status: "absent", reason_id: null, note: null },
      { enrolment_id: "g1", attendance_date: "2026-01-15", status: "absent", reason_id: null, note: null },
    ],
  });
  for (const section of document.sections) {
    const rowAttendance = section.learners.reduce((sum, learner) => sum + learner.termAttended, 0);
    const rowAbsence = section.learners.reduce((sum, learner) => sum + learner.termAbsent, 0);
    const rowPossible = section.learners.reduce((sum, learner) => sum + learner.termDays, 0);
    assert.equal(section.termAttendanceTotal, rowAttendance);
    assert.equal(section.termAbsenceTotal, rowAbsence);
    assert.equal(section.termPossibleTotal, rowPossible);
    assert.equal(rowAttendance + rowAbsence, rowPossible);
    assert.equal(
      Object.values(section.attendanceByDate).reduce((sum, value) => sum + value, 0),
      section.termAttendanceTotal,
    );
    assert.equal(
      Object.values(section.absenceByDate).reduce((sum, value) => sum + value, 0),
      section.termAbsenceTotal,
    );
    assert.equal(
      Object.values(section.possibleByDate).reduce((sum, value) => sum + value, 0),
      section.termPossibleTotal,
    );
  }
  assert.equal(
    document.fullTerm.possibleLearnerDays,
    document.sections.reduce((sum, section) => sum + section.termPossibleTotal, 0),
  );
});

test("full-term indexes every governed closure and keeps the complete name in the band", () => {
  const reasons = {
    "2026-01-13": "Regional agricultural show and district livestock exhibition",
    "2026-01-14": "Municipal water interruption for the greater school catchment area",
    "2026-01-15": "National youth day commemorative programme and community march",
  };
  const document = build({
    fullTerm: { today: "2026-01-18" },
    enrolments: [learnerRow({ id: "one" })],
    impactRows: impactRows({
      "2026-01-13": "NO_TEACHING",
      "2026-01-14": "NO_TEACHING",
      "2026-01-15": "NO_TEACHING",
    }),
    overrideRows: Object.entries(reasons).map(([school_date, reason]) => ({ school_date, reason })),
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  for (const sheet of plan.sheets) {
    const notes = sheet.closureNotes.filter((note) => reasons[note.date]);
    assert.equal(notes.length, 3);
    assert.deepEqual(notes.map((note) => note.index), [1, 2, 3]);
    assert.ok(notes.every((note) => note.continuation));
    // The plan keeps the governed reason verbatim; the renderer wraps it rather
    // than truncating it.
    assert.deepEqual(notes.map((note) => note.label), Object.values(reasons));
    assert.ok(notes.every((note) => note.lines.length > 0));
    assert.ok(sheet.closureBandHeight > 0);
  }
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  const squash = (value) => value.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  for (const reason of Object.values(reasons)) assert.ok(squash(html).includes(squash(reason)));
});

test("full-term deduplicates identical enrolment evidence and keeps two-line names legible", async () => {
  const duplicate = build({ enrolments: [learnerRow({ id: "same" }), learnerRow({ id: "same" })] });
  assert.equal(boys(duplicate).learners.length, 1);

  const long = "A".repeat(200);
  // Extreme names over a full 70+ date term exceed the A1 width at the 12pt
  // date-column floor, so the only honest outcome is the explicit fallback.
  const fullTermDocument = build({
    fullTerm: { today: END },
    impactRows: impactRows(),
    enrolments: [learnerRow({ id: "long", surname: long, first_names: long })],
  });
  assert.equal(fullTermLayout.planRegisterTeacherFullTermDocument(fullTermDocument).fits, false);

  // A shorter included window has room for the same name on two 8pt lines.
  const document = build({
    fullTerm: { today: "2026-01-18" },
    termStart: START,
    termEnd: "2026-01-16",
    impactRows: impactRows(),
    enrolments: [learnerRow({ id: "long", surname: long, first_names: long })],
  });
  const plan = fullTermLayout.planRegisterTeacherFullTermDocument(document);
  assert.equal(plan.fits, true);
  assert.ok(plan.sheets[0].nameLines >= 2);
  // Every wrapped name line must fit the planned row at the 8pt floor.
  assert.ok(plan.sheets[0].rowHeight >= plan.sheets[0].nameLines * 8 * 1.02);
  assert.ok(plan.sheets[0].rowHeight >= 18.8);
  const html = fullTermHtml.renderRegisterTeacherFullTermHtml({ header: HEADER_FIXTURE, document, plan });
  assert.ok(html.includes(long));
  assert.match(html, /@page \{ size: (1683\.78pt 1190\.55pt|2383\.94pt 1683\.78pt); margin:32pt; \}/);
  const { bytes, pageCount } = await fullTermPdf.renderRegisterTeacherFullTermPdf({ header: HEADER_FIXTURE, document, plan });
  assert.equal(pageCount, 2);
  assert.ok(bytes.length > 0);
});

test("full-term route exposes the opt-in mode, closing date and explicit paginated fallback", () => {
  const route = readFileSync("src/app/api/attendance/register-teacher/route.ts", "utf8");
  assert.match(route, /requestedMode === "full-term"/);
  assert.match(route, /fullTerm: fullTermRequested \? \{ closingDate \} : null/);
  assert.match(route, /planRegisterTeacherFullTermDocument\(document\)/);
  assert.match(route, /The unchanged paginated term register is shown instead/);
  assert.match(route, /RegisterTeacherFullTermError/);
  assert.match(route, /renderRegisterTeacherFullTermHtml/);
  assert.match(route, /renderRegisterTeacherFullTermPdf/);
});
