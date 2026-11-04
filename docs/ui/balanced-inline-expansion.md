# Global summary-first configuration cards — ScolaPro UI standard

**Owner:** Control Room. **Initial implementation:** issue #1192, PR #1193. **Related staff/HOD authority:** issue #1191, PR #1194.

## Canonical components

- `src/components/ui/configuration-card.tsx` — `ConfigurationCard`: title, icon, existing-data summary, and a conditional editor *inside the same article*. The summary remains visible during editing.
- `src/components/ui/card-action-toggle.tsx` — `CardActionToggle`: compact top-right brand-tinted pencil **Edit** (or plus **Add**), changing to muted-danger X **Close** without a solid-danger fill. Implements `aria-expanded` and `aria-controls`.
- Continue using `RecordActionButton` for individual record-level pencil/manage actions; it is not the standard header configuration disclosure.

## Layout contract

1. **Configured/current data first**: meaningful records, status, dates, portfolio/room/grade details before any editable form. Empty states clearly say what is missing.
2. **One configuration, one card**: title and concise description top-left, Edit/Add/Close top-right, configured summary beneath, conditional editor beneath *inside the same boundary*. No detached panels, duplicate headings, or parallel blank columns.
3. Toggle actions use exactly `Edit`, `Add`, `Close`, and matching brand/danger design tokens. Destructive operations retain separate, specifically labelled confirmation workflows.
4. Save/submit/Cancel buttons remain where users complete work; do **not** blindly shorten these actions or hide active attendance, marks, registers, timetable grids or search controls.
5. Use ScolaPro `Picker`, `DateField`, `SearchableSelect`, responsive grids, proper focus, permission and error states. No inline browser-native selects or new authorization bypasses.
6. Use one editor open at a time when cards represent alternatives, as in Academic Setup. Keep historical provenance visible, including effective-dated HOD appointments.

## First migration coverage

- Academic Setup: timetable workflow and calendar anchor split into separate in-card editors; HOD summary is visible before its edit forms.
- Grade and register-class creation: compact top-right Add/Close.
- Rooms & blocks: top-right Add/Close and preserved room record edit/delete actions.

## Site-wide adoption

Search all routes and nested components for `Close ... settings`, `Edit ... settings`, long card-footers with only a disclosure button, summary/editor duplication, and forms rendered before the existing record. Migrate *applicable* surfaces in batches under this standard. Audit Staff, Timetables, Academic Setup, Registers, Conduct, Curriculum, Documents, Teaching Files, Inventory, School Settings, and hidden pages. Do not represent unchecked routes as migrated.

## Verification requirements

- UI regression + lint + typecheck + build for exact HEAD.
- Database gates for any changed migration or permission logic.
- Responsive signed-in light/dark screenshots (375px, 768px, 1440px), focus states, close/reopen, save/error states, and no clipping/overflow.
- Control Room review for exceptions, including role-specific screens and effective-dated records.
- Merge/deploy only after acceptance gates. Never assume a successful preview or CI equals manual browser acceptance.
