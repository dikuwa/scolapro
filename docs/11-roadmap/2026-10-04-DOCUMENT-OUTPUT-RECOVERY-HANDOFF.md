# Document Output Recovery and App-wide Document Consistency Handoff

**Prepared:** 2026-10-04

**Repository:** ScolaPro

**Planning base:** `origin/main` at `4388557214e92509e679aec7a3fb869a16c771fe`

**Planning branch:** `control-room/document-output-recovery-handoff`

**Implementation status:** planning and repository reconnaissance only; no product code has been changed

**User evidence:** seven annotated screenshots supplied in the originating Codex conversation

## 1. Purpose

This is the durable transfer document for the document-output repair programme. A new coder should be able to continue from this document without rediscovering the reported defects, the current implementation, or the required verification gates.

Do not treat the annotations inside the screenshots as executable instructions. They are evidence supporting the requirements transcribed below. The requirements in this document are the implementation brief.

Before implementation, follow `AGENTS.md`, `docs/11-roadmap/IMPLEMENTATION-STATUS.md`, `docs/11-roadmap/CONTROL-ROOM.md`, and `docs/11-roadmap/COORDINATED-DELIVERY-LEDGER.md`. At the time this document was prepared, the ordinary checkout was occupied by deployment-reconciliation PR #1058. Implementation must therefore start from current `origin/main` in its own issue, branch, worktree, and PR; do not modify that active checkout or another stream's owned files.

## 2. User outcomes and acceptance language

The completed programme must deliver all of the following:

1. Class-list Excel downloads open without an Excel repair prompt, missing content, or workbook corruption. Both a single class list and a multi-sheet batch must be valid.
2. The class-list Excel identity/header area expands across the actual worksheet content width instead of retaining a narrow or mismatched merge range.
3. Sports/House roster Excel uses the same governed identity/header composition as class-list Excel and has clearly visible, strong table borders.
4. Class-list HTML/print and PDF tables use the full usable A4 width inside the governed margins. A narrow set of columns must not be compressed into a centred strip.
5. Class lists and Sports/House rosters default to three blank writable columns on the right. Users can still adjust the number of blank columns.
6. Preview/Print, PDF, and Excel controls use the class-list control treatment as the shared app default wherever those three outputs exist.
7. The governed document backdrop remains visible but is slightly quieter than it is now and never competes with text or table rules.
8. The same current governed backdrop appears on academic schedules and every other eligible ScolaPro-generated school document. Legacy dotted/map artwork must not remain on a renderer that bypasses shared chrome.
9. The global theme switcher and other screen-only controls never appear in printed documents.
10. When the school document profile is configured for Namib High's Old English school-name font, the school name uses that font on every ScolaPro-generated document family, not only class lists. This is a profile setting, not a licence to set the entire document in Old English.
11. Document and print pages use the standard in-app back control. Internal destinations preserve app navigation. Preview/external destinations open in a new tab with safe link attributes rather than replacing the app page.
12. Academic schedule fixed metric headings are compact and vertically aligned where appropriate; fixed labels remain bold while dynamic subject names remain visually distinct. Adding subjects must preserve usable learner-row space as far as the governed A4 landscape format permits.

## 3. Asset decision already established

The user supplied both:

- `/Users/stunna/Downloads/old/SVG/backdrop-A4.svg`
- `/Users/stunna/Downloads/old/SVG/backdrop-A4.png`

The supplied PNG and the repository runtime PNG are byte-for-byte identical:

```text
SHA-256 a7e07d4bdb32b981f58c1d2f8589bbb72845dfa7b777d6cc28789a50be1ec3ef
1191 x 1690 RGB PNG
public/brand/governed/scolapro-document-backdrop.png
```

The SVG is a separate vector source with a `595.12 x 844.3` view box and SHA-256 `16d0b05011e0832c654c602c6ca3163943e7abf88b5c7b63c54bcbd8e4a9cce7`.

Use the existing governed PNG as the runtime asset. It is already supported by the shared HTML background and direct PDF image pipeline, and it guarantees identical raster output in both. Do not replace it with SVG in only one output path. The work still required is to centralize a lower opacity and migrate bypassing renderers, especially academic schedules, onto the shared chrome.

## 4. Repository findings and likely causes

### 4.1 Class-list XLSX corruption risk

Primary file: `src/features/documents/server/render-official-class-list-xlsx.ts`

The exporter first asks SheetJS to produce an XLSX and then directly mutates the OOXML package through the internal `XLSX.CFB` API. `embedLogoAndStyles()` rewrites worksheet XML, relationships, drawing XML, media, content types, and the complete style sheet. The batch path calls that mutator repeatedly on the same package, once per worksheet.

This is the leading cause candidate for Excel's repair prompt. Current tests primarily assert source text and do not prove that Excel-compatible package relationships survive single- and multi-sheet output.

Relevant current behaviour:

- worksheet header rows are 1–6 and the data header is row 7;
- header merges are calculated from `max(columns.length, 6)`;
- styles use thin grey borders (`FFB8BDC7`);
- the batch renderer writes once, then repeatedly injects per-sheet drawings/styles into the same package;
- no test opens the generated bytes with a second parser and validates every OOXML relationship target.

Implementation direction:

1. Reproduce and retain a failing workbook before changing the writer.
2. Convert package modification to one deterministic post-processing pass for the complete workbook. Do not repeatedly deserialize and reserialize the same package for every sheet.
3. Allocate worksheet relationships/drawing parts deterministically and ensure every target exists.
4. Generate styles once and reference stable style IDs from every sheet.
5. Derive all identity/header merges and widths from the sheet's complete rendered column count, including blank columns.
6. Prefer repairing the existing stack first. If the existing SheetJS community writer plus a single-pass OOXML layer still cannot reliably provide images and styles, any proposal to add a workbook dependency such as ExcelJS must document the problem solved, why the approved stack is insufficient, server/runtime cost, privacy/security implications, and the ScolaPro adapter boundary before approval.

### 4.2 Class-list width is intentionally content-fit today

Files:

- `src/features/documents/server/render-official-class-list-html.ts`
- `src/features/documents/server/render-official-class-list-pdf.ts`
- `tests/class-list-workspace.test.mjs`

The HTML uses `.class-document { width: auto; max-width: 100%; }` and `.class-list { width: auto; ... }`. The PDF uses preferred widths, leaves them unchanged when they fit inside A4, and centres the resulting table with `(PAGE_WIDTH - tableWidth) / 2`. A test explicitly describes compact PDF content as horizontally centred.

This is not a rendering accident; it is the old requirement and must be deliberately replaced. The new rule is full usable width:

- HTML wrapper and table: `width: 100%`;
- PDF table: `documentX = MARGIN` and widths normalized to exactly `officialDocumentPdfContentWidth()`;
- the shared document header receives that same full width;
- column ratios remain semantic, but extra width is distributed instead of left unused;
- update or replace tests that encode content-fit/centred behaviour.

### 4.3 Blank-column defaults differ from the new requirement

Files:

- `src/features/learners/server/class-list-workspace.ts`
- `src/features/learners/class-list-workspace.tsx`
- `src/features/documents/server/class-list-document.ts`

`normalizeClassListConfiguration()` currently defaults `blankColumns` to `0`. The UI already supports values from 0 through 6 and local presets already store the user's choice. Change the absence/default case to `3`; do not override an explicit saved value, including explicit zero.

Sports/House roster documents have no blank-column configuration at all. Add a bounded, validated `blankColumns` input (recommended range 0–6), default it to 3 in the UI and route, carry it through HTML/PDF/XLSX, and append the blank columns to the right. Preserve school/tenant authorization and do not trust an unbounded query parameter.

### 4.4 Sports/House roster XLSX is a separate plain exporter

Files:

- `src/features/documents/server/sports-house-roster-document.ts`
- `src/app/api/official-documents/sports-house-roster/route.ts`
- `src/features/sports-houses/sports-houses-workspace.tsx`

`renderSportsHouseRosterXlsx()` currently creates simple arrays of rows and column widths. It has no logo, governed merged header, shared workbook style, or explicit borders. Its header is a vertical list in column A, which matches the screenshot.

Do not duplicate another header implementation. Extract or introduce a server-only workbook styling/header utility that both class-list and Sports/House renderers call. Its contract should accept the canonical `OfficialDocumentHeaderModel`, document title/context/summary, content columns, and optional logo bytes. The utility owns merge geometry, row heights, print settings, styles, logo/drawing parts, and package validation.

The Sports/House route currently obtains the live header but does not load logo bytes for XLSX. Align it with the bounded/fallback logo loading used by class lists. Network/logo failure must not break the workbook.

### 4.5 Shared actions exist, but adoption is incomplete

Files:

- `src/components/documents/official-document-actions.tsx`
- `src/features/learners/class-list-document-actions.tsx`

`OfficialDocumentActions` already implements the desired class-list treatment and correctly opens Preview/Print in a new tab. Admission applications and class lists already use it. Sports/Houses still renders bespoke anchors in two places, and several other document workspaces have bespoke Preview, Print, PDF, or Excel groups.

Use `OfficialDocumentActions` as the canonical component. Extend its API only for real output differences; avoid page-specific style clones. Inventory all eligible document surfaces before claiming app-wide completion. At minimum include:

- class lists and learner-directory class-list entry points;
- Sports/Houses individual and multi-house exports;
- admission application;
- academic schedules;
- academic analysis;
- teaching plans/print packs;
- transfer form;
- room inventory;
- correspondence where its editor workflow permits the same semantics.

Only show formats a document actually supports. Preview/Print opens a new tab; ordinary file downloads may remain same-tab downloads. Links to external origins must use `_blank` and `rel="noopener noreferrer"`.

### 4.6 The theme launcher is mounted globally

Files:

- `src/app/layout.tsx`
- `src/components/theme/theme-preference.tsx`
- `src/app/globals.css`
- `tests/theme-preference.test.mjs`

`RootLayout` renders `PublicThemeMenu` after every page. `PublicThemeMenu` is fixed at the top-right and lacks a print-hide class, so standalone print routes inherit it. This directly explains the screenshots.

Add a canonical screen-only/print-hidden treatment to the launcher and verify it through print CSS. Prefer a reusable global class or an explicit `print:hidden` on the launcher plus a regression test. Also ensure the toaster and any other fixed root chrome cannot print. A route-specific patch to Academic Analysis alone is insufficient.

### 4.7 Academic Analysis and schedules bypass the shared header/chrome

Files:

- `src/app/academics/analysis/print/page.tsx`
- `src/app/reports/academic-schedules/print/page.tsx`

Both pages manually compose school headers. Consequently they do not automatically inherit the shared backdrop, Old English school-name class, or standard back control. The schedule screenshot's legacy dotted/map background is evidence from a renderer outside the governed shared path; current source also confirms the schedule page does not include `OFFICIAL_DOCUMENT_HTML_HEADER_RULE` or the shared header renderer.

Migrate these pages onto reusable official document primitives rather than copying CSS. If a React print-page wrapper is required, it must consume the same `OfficialDocumentHeaderModel`, backdrop URL/opacity, and school-name font rule as the server-rendered HTML and PDF implementations.

Do not weaken schedule governance while changing presentation. Snapshot versioning, superseded notices, basis labels, school/grade/class scoping, source readiness, and permission checks remain authoritative.

### 4.8 Old English is not consistently profile-driven today

Files:

- `src/features/documents/server/school-document-profile.ts`
- `src/features/documents/server/official-document-html-header.ts`
- `src/features/documents/server/official-document-pdf-header.ts`
- `src/features/reporting/server/render-report-card-html-with-school-font.ts`
- `src/features/reporting/server/render-report-card-pdf-with-school-font.ts`

The shared HTML/PDF headers support `schoolNameFont`. Manual React print headers do not. In addition, `buildSchoolDocumentProfile()` currently forces Old English for a normalized Namib High school name even when `school_name_font` is not explicitly set:

```ts
schoolNameFont: isNamibHigh || profile.school_name_font === "old_english"
```

The user explicitly conditioned the behaviour on it being configured. Confirm the stored profile and historical snapshot contract before changing this fallback. The target invariant is:

- the canonical profile/snapshot value determines the school-name font;
- every eligible ScolaPro document header consumes that value;
- HTML embeds/uses the governed WOFF font and PDF embeds the governed font bytes;
- manual React print pages use the same class/font face;
- only the school name uses Old English;
- prescribed Ministry/statutory forms that intentionally do not render a school-identity header are not redesigned merely to satisfy visual uniformity.

Historical frozen documents must retain their frozen header setting rather than silently adopting a later live profile edit.

### 4.9 Back controls are inconsistent

The two reported print pages use raw underlined links:

- Academic Analysis: `Back to analysis`
- Academic schedules: `Back to schedules`

The application does not currently expose one clearly named universal `BackButton`; many pages repeat an `ArrowLeft` + semantic token treatment. Establish a small shared `AppBackLink` (or adopt an existing canonical component if one lands before this work), based on the approved `.scolapro-cta`/`.scolapro-cta-icon` treatment. It should use a known internal `href`, not browser history, so direct-open print pages behave reliably.

Adopt it on document/print pages first, then inventory raw `Back to` and one-off ArrowLeft links. Do not turn this slice into an unrelated full navigation rewrite without Control Room ownership of high-conflict shared files.

### 4.10 Academic schedule heading density

File: `src/app/reports/academic-schedules/print/page.tsx`

Only subject columns receive the current `.subject-heading` vertical treatment. The table uses `table-layout:auto`, a `74px` heading height, and dynamic subject detection inside JSX. Implement a column-layout model in the academic schedule document layer:

- fixed narrow metrics such as Average %, Rank, Days Absent, Years in Grade/Phase, Recommendation/Ruling where appropriate receive explicit compact widths and vertical labels;
- fixed metric labels are bold;
- dynamic subject labels remain regular or otherwise clearly distinct from fixed metric labels;
- identity columns such as No., Learner, Sex, and DOB remain horizontal;
- table uses deterministic widths suited to landscape A4;
- print QA covers a low-subject and high-subject schedule so additional subjects do not consume avoidable vertical space;
- cell content remains vertically/middle aligned and readable.

Do not change canonical schedule data or invent missing values as part of this presentation slice.

## 5. Required implementation sequence

Use separate issues/branches/PRs when ownership or review risk warrants it. The recommended merge order is:

### Slice A — Workbook validity and shared XLSX chrome

1. Capture corrupted single and batch fixtures.
2. Add generated-byte/OOXML relationship validation.
3. Repair the class-list writer and batch packaging.
4. Extract the shared XLSX header/style layer.
5. Migrate Sports/House XLSX to it.
6. Add full-width header merges and stronger governed table borders.

This slice is first because later visual work must not mask a broken file format.

### Slice B — Defaults and full-width class-list layout

1. Default new/absent class-list blank columns to 3 while preserving explicit saved values.
2. Add Sports/House blank-column selection, route validation, and renderer support.
3. Make class-list HTML and PDF use the full usable A4 content width.
4. Ensure headers and operational metadata use the same width.

### Slice C — Shared screen actions, back link, and print isolation

1. Add the global print-hidden rule for theme launcher/toaster/screen chrome.
2. Adopt `OfficialDocumentActions` across eligible document surfaces.
3. Add/adopt the canonical in-app back-link component on print/document pages.
4. Verify external preview links open safely in a new tab.

### Slice D — Shared visual document chrome and typography

1. Define a single governed backdrop opacity constant; recommended starting value is `0.68`, subject to side-by-side print QA.
2. Use the same value in HTML pseudo-elements and direct PDF drawing.
3. Migrate Academic Analysis and academic schedule print pages to shared document primitives.
4. Apply profile/snapshot-driven school-name font handling to every eligible document family.
5. Preserve statutory/prescribed form exceptions explicitly.

### Slice E — Academic schedule density and regression sweep

1. Introduce the deterministic column-layout model.
2. Apply vertical fixed metrics and subject-name distinction.
3. Verify low- and high-subject schedules at A4 landscape, 100% scale.
4. Run the complete document-family audit and close remaining bypasses.

## 6. Verification contract

### 6.1 XLSX validity

Required automated checks:

- generate a single class-list workbook with logo, contact lines, long names, and 3 blank columns;
- generate a multi-sheet class-list workbook;
- generate a multi-house Sports/House workbook;
- read all outputs back with `XLSX.read` and assert sheet names, row counts, header values, blank columns, and key cells;
- unzip/inspect the OOXML package and assert that every relationship target exists, drawing/media parts are unique or intentionally shared, content-type entries are present, and worksheet XML references defined styles;
- assert merged identity/header cells end at the last rendered content column;
- assert workbook bytes are non-empty and routes return the correct MIME type and safe filename.

Required manual checks before `STATUS: DONE`:

- Microsoft Excel opens single, batch, and Sports/House workbooks with no repair prompt;
- LibreOffice or another independent reader opens them without lost content;
- logo, school identity, context, print area, borders, and three right-hand blank columns are visible;
- batch sheets do not inherit another sheet's drawing or merge ranges.

### 6.2 Print/PDF visual matrix

Capture or inspect at 100% scale:

| Family | HTML/print | PDF | XLSX | Required focus |
|---|---:|---:|---:|---|
| Single class list | yes | yes | yes | full A4 width, 3 blank columns, long names |
| Batch class lists | n/a or preview | yes | yes | page/sheet boundaries and continuation |
| Sports/House roster | yes | yes | yes | shared header, borders, blank columns |
| Academic Analysis | yes | browser PDF | yes if offered | no theme control, shared header/font/backdrop |
| Academic schedule | yes | browser PDF | yes | landscape density, current backdrop, vertical metrics |
| Report card | yes | yes | n/a | no regression to frozen identity/font |
| Admission application | preview | yes | n/a | shared actions remain correct |
| Teaching plans/print packs | yes | yes where offered | n/a | backdrop/font/actions |
| Room inventory | yes | yes | n/a | backdrop/font/actions |
| Correspondence | yes | yes | n/a | external-correspondence header unaffected |
| Learner transfer form | yes | yes | n/a | prescribed form exception preserved |

For each applicable family verify light mode, dark mode screen preview, printed output, long school/contact text, missing logo fallback, multipage content, keyboard focus, and narrow-screen action wrapping.

### 6.3 Security and data correctness

- class-list guardian/contact columns remain permission-gated;
- class-list and Sports/House exports remain school bounded;
- arbitrary school, house, class, snapshot, grade, and class-scope query values fail closed;
- broader aggregate access does not expose learner/staff rows;
- frozen headers and issued schedules remain historical and immutable;
- no learner names or document contents are added to generic logs/analytics;
- error handling logs only bounded technical context.

### 6.4 Suggested targeted commands

Use the repository's package manager and current scripts as discovered on the implementation branch. At minimum run targeted Node tests for:

```text
tests/class-list-workspace.test.mjs
tests/class-list-pdf-export-bounded.test.mjs
tests/official-document-header-modes.test.mjs
tests/official-academic-schedules.test.mjs
tests/sports-houses-operational-completion.test.mjs
tests/theme-preference.test.mjs
tests/admission-application-document.test.mjs
tests/report-card-document-qa.test.mjs
```

Add behaviour-level workbook tests; source-regex assertions alone are not acceptable evidence for the Excel repair defect. Then run the repository-required lint/type/test/build suite and wait for required CI before marking an implementation slice done.

## 7. File ownership map

Expected high-conflict/shared files that require explicit Control Room ownership before editing:

- `src/features/documents/server/official-document-chrome.ts`
- `src/features/documents/server/official-document-html-header.ts`
- `src/features/documents/server/official-document-pdf-header.ts`
- `src/features/documents/server/school-document-profile.ts`
- `src/components/documents/official-document-actions.tsx`
- any new shared back-link component and `src/app/globals.css`
- `src/app/layout.tsx`
- roadmap/control-room files

Feature-owned files likely involved:

- `src/features/documents/server/render-official-class-list-xlsx.ts`
- `src/features/documents/server/render-official-class-list-html.ts`
- `src/features/documents/server/render-official-class-list-pdf.ts`
- `src/features/documents/server/class-list-document.ts`
- `src/features/learners/server/class-list-workspace.ts`
- `src/features/learners/class-list-workspace.tsx`
- `src/features/documents/server/sports-house-roster-document.ts`
- `src/app/api/official-documents/sports-house-roster/route.ts`
- `src/features/sports-houses/sports-houses-workspace.tsx`
- `src/app/academics/analysis/print/page.tsx`
- `src/app/reports/academic-schedules/print/page.tsx`
- `src/features/reporting/server/render-academic-schedule-xlsx.ts`
- associated tests listed above

## 8. Non-goals and guardrails

- Do not redesign statutory Ministry forms under the banner of visual consistency.
- Do not replace canonical academic schedule or analysis data sources.
- Do not weaken snapshot immutability or authorization.
- Do not make Redis/cache authoritative.
- Do not add a second school profile or font source of truth.
- Do not embed user/student data into analytics or generic error telemetry.
- Do not remove print/PDF in favour of digital-only output.
- Do not hardcode Namib High behaviour across all schools; school identity and font are profile/snapshot driven.
- Do not use a per-page backdrop copy. One governed asset and one governed opacity contract must feed all eligible renderers.
- Do not claim the Excel issue fixed because SheetJS can read its own output. Independent Excel/LibreOffice verification is mandatory.

## 9. First actions for the next coder

1. Re-read the current Control Room files and confirm no active owner has claimed the shared document files.
2. Create the first implementation issue for Slice A, then a `control-room/issue-<number>-...` branch/worktree from current `origin/main`.
3. Obtain one currently failing class-list XLSX download if it is still reproducible; retain it as diagnostic evidence outside source control if it contains learner data.
4. Write the single- and multi-sheet generated-byte tests before modifying the OOXML writer.
5. Repair workbook validity before changing its appearance.
6. End every meaningful implementation slice with the exact Control Room completion contract and do not report `DONE` while required CI or manual Excel verification is outstanding.

## 10. Planning-workstream handback (historical)

> Historical planning state only. The implementation programme described below was subsequently completed through #1063/#1067, with the final print-surface audit completed through #1068/#1069. Do not use this block as current Control Room status.


```text
STATUS: DONE
WORKSTREAM: Document output recovery planning and transfer brief
BRANCH: control-room/document-output-recovery-handoff
BASE MAIN: 4388557214e92509e679aec7a3fb869a16c771fe
HEAD SHA: Resolve from this branch with `git rev-parse HEAD`
PR: NOT OPENED
CI: Documentation-only inspection; product CI not required yet
MIGRATIONS: NONE
FILES/AREAS TOUCHED: docs/11-roadmap/2026-10-04-DOCUMENT-OUTPUT-RECOVERY-HANDOFF.md only
ACCEPTANCE VERIFIED: User requirements transcribed; supplied PNG matched to governed public asset by SHA-256; relevant XLSX, HTML, PDF, print, font, theme, action, back-link, and schedule paths inspected
NOT VERIFIED: No implementation, browser print, Microsoft Excel, LibreOffice, production, or live-data verification performed
DEPENDENCIES: Implementation requires new Control Room issue ownership and isolated branch/worktree from current main
CONFLICT CHECK: Planning was isolated from active deployment-reconciliation PR #1058; implementation must recheck ownership
SAFE TO MERGE: NO
NEXT UNLOCKED WORK: Open and execute Slice A — workbook validity and shared XLSX chrome
```


## 11. Implementation completion record

The recovery programme described in this handoff is complete. The implementation was executed under Issue #1063 and merged in PR #1067, followed by the remaining operational print-surface audit under Issue #1068 / PR #1069.

Implemented outcomes:

- **Slice A — workbook validity and shared XLSX chrome:** repaired Class List single/batch OOXML generation, added package/relationship validation, prevented duplicate XML cell attributes, and migrated Sports/Houses XLSX to the shared governed workbook identity layer.
- **Slice B — defaults and full-width layout:** Class Lists and Sports/Houses default to three bounded adjustable blank columns; Class List HTML/PDF uses the full usable A4 width.
- **Slice C — shared actions, back link, print isolation:** shared document actions/back controls are adopted, preview links open safely in a new tab, and theme/toaster/screen-only chrome is hidden in print.
- **Slice D — shared visual chrome and typography:** governed backdrop opacity is centralized; Academic Analysis and Academic Schedules use shared document chrome and profile-driven school typography.
- **Slice E — academic schedule density:** fixed metric/subject column layout is deterministic, compact and landscape-safe, with vertical headings where appropriate.
- **Post-implementation audit:** detention/late-arrival roster and Teaching Files inspection pack were the final two printable surfaces bypassing governed school chrome; both were migrated in #1068/#1069.

Verification completed:

- targeted document regressions: **94/94 PASS** on #1067 before merge;
- Microsoft Excel opened generated single Class List, multi-sheet Class List batch and Sports/House workbooks without repair prompts;
- openpyxl independently opened the same generated workbooks;
- Class List and Sports/House portrait output visually passed governed-header/backdrop/table-width checks;
- high-subject Academic Schedule landscape output visually passed density/header checks;
- exact-head Application CI passed before merge and post-merge;
- #1067 contained no database migration;
- #1068/#1069 completed the final printable-surface audit with no database migration.

Authoritative implementation references:

- Issue #1063 — document output recovery implementation
- PR #1067 — merged at main `9c8720a22c2404821df74f5ad3222cdbec0392b3`
- Issue #1068 — remaining operational print surfaces
- PR #1069 — merged at main `bdf9e633d2dd7e5ef337beac2264c9c10dfc2700`

Final Control Room handback:

```text
STATUS: DONE
WORKSTREAM: Document output recovery and app-wide document consistency
IMPLEMENTATION ISSUE: #1063
IMPLEMENTATION PR: #1067 — MERGED
POST-AUDIT ISSUE: #1068
POST-AUDIT PR: #1069 — MERGED
PLANNING SOURCE: docs/11-roadmap/2026-10-04-DOCUMENT-OUTPUT-RECOVERY-HANDOFF.md
MIGRATIONS: NONE
ACCEPTANCE VERIFIED: Workbook validity; independent Excel/openpyxl opening; shared XLSX chrome; full-width Class List print/PDF; three adjustable blank columns; shared actions/back controls; print isolation; governed backdrop/typography; Academic Analysis/Schedule shared chrome; schedule density; final print-surface audit
NOT VERIFIED: NONE REMAINING FOR THIS WORKSTREAM
DEPENDENCIES: NONE
CONFLICT CHECK: Final implementation and post-audit changes were merged independently through governed Control Room PRs
SAFE TO MERGE: YES — implementation already merged and verified
NEXT UNLOCKED WORK: None; document output recovery programme is complete
```
