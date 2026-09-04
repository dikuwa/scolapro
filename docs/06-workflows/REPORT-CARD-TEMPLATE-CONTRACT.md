# Report Card Template Contract

This contract defines the authoritative ScolaPro term report-card presentation layer. It is based on the annotated Namib High School report-card reference supplied during the 2026-09-04 reporting QA pass.

## Principles

- Report cards render from immutable `report_card_snapshots`; historical certified documents must not be recalculated from later rules or school-setting changes.
- The same renderer is used for individual, class, grade, custom, and whole-school report-card generation.
- The document remains recognisably an official school report rather than a dashboard printout.
- School branding and report presentation are school-scoped. No school-specific typography is a platform-wide default.

## School document profile

`school_settings.setting_key = 'document_profile'` stores school-owned document identity fields:

- `former_name`
- `logo_url`
- `physical_address`
- `telephone`
- `fax`
- `email`
- `postal_address`
- `town`
- `school_name_font`

`school_name_font` defaults to the normal ScolaPro/document sans-serif treatment. The value `old_english` is an explicit school-scoped override intended for Namib High School's document identity. Other schools continue to use the default site/document font unless they deliberately configure another supported document treatment in future.

The HTML renderer uses the Old English Text MT family name with safe blackletter/serif fallbacks when `old_english` is selected. The PDF renderer does not make arbitrary server-side font or logo downloads; proprietary/custom font embedding and binary school-logo embedding require an approved stored asset path rather than remote URL fetching.

## Report-card settings

`school_settings.setting_key = 'report_card_settings'` supports:

- `show_percentages` (default `false`)
- `show_non_promotional_subjects` (default `true`)
- `remarks_mode` (`manual` by default; future governed modes can include rules-based or AI-assisted drafting)
- `default_remark`
- `show_pass_mark_legend` (default `true`)

## Per-subject report settings

`school_settings.setting_key = 'report_card_subject.<subject_id>'` supports:

- `minimum_pass_mark`
- `promotional` (default `true`)
- `show_on_report_card` (default `true`)

A numeric result below the frozen subject minimum pass mark receives a small raised `*` beside the learner's mark. A non-promotional subject uses a leading `*` before the subject name. These are separate meanings and are explained in the printed legend.

## Responsive term matrix

A generated report freezes `report_terms` through the selected/current term:

- Term 1 report: Term 1 occupies the full result width.
- Term 2 report: Terms 1-2 share the result width.
- Term 3 report: Terms 1-3 share the result width.

When percentages are disabled, each term uses `Mark | Symbol`. When enabled, each term uses `Mark | % | Symbol`. Empty future-term columns are not printed.

## Sign-off and school calendar

Snapshots freeze:

- assigned register teacher name from the learner's register class;
- current principal name from the active principal membership;
- learner absence count from the existing term attendance snapshot;
- next configured academic term start date when available.

The printed document leaves a physical signature line above both `Register Teacher: <name>` and `Principal: <name>`. A separate school-stamp area remains available.

## Remarks

Remarks are a frozen snapshot field. AI assistance, when introduced, must remain a suggestion/review mechanism and must not silently publish generated text onto a certified report.
