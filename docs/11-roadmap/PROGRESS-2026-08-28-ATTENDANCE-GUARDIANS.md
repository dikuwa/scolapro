# ScolaPro Progress — Attendance Mobile + Guardian Foundation

Date: **28 August 2026**

This checkpoint exists so another developer/AI can continue without rediscovering completed work.

## Completed in this pass

### Attendance interaction and mobile readiness

- Sidebar collapse control moved outside the scroll-clipped sidebar and raised above the shell with a deliberate z-index.
- Day/Week attendance switching now gives immediate spinner feedback while navigation is pending.
- Search fields use the shared ScolaPro control surface and `focus-within` state so focus belongs to the complete search control, not the inner text input.
- Native browser attendance-reason selects were replaced with the shared ScolaPro `Picker`.
- Present, Absent, Late and Excused use semantic state colors and matching icons.
- Active status is deliberately stronger than inactive choices.
- Daily attendance keeps the complete class list visible and opens details only for the learner being edited.
- Daily evidence supports private JPG/PNG/WebP/PDF upload and mobile camera capture where supported.
- Weekly attendance now also supports evidence for a specific learner/day using the same private evidence pipeline.
- Weekly mobile layout uses learner cards with five compact Monday-Friday status controls rather than forcing the desktop matrix into an unusable phone viewport.
- Weekly desktop retains the compact matrix.
- Weekly exception editing uses a mobile bottom sheet / desktop dialog while keeping the workflow identical across devices.
- Bottom navigation hides text labels on very narrow phones and keeps icon navigation accessible with `aria-label`.
- ScolaPro-owned tooltip styling is available through `data-tooltip`; native `title` tooltips should not be introduced for new product UI.

### Attendance domain separation already established

ScolaPro keeps these as separate operational records:

1. official morning/register attendance used for school/statutory attendance;
2. subject-period attendance taken by the teacher actually teaching a lesson;
3. school late-arrival/detention tracking, which is disciplinary/operational and must not inflate EMIS absence statistics.

### Guardian / parent foundation

Added physical persistence for:

- `guardian_profiles` — a guardian is an independent person, not a field embedded inside the learner;
- `learner_guardians` — effective-dated learner ↔ guardian relationships so siblings reuse the same guardian;
- `guardian_contacts` — effective-dated email/mobile/phone/WhatsApp/address history;
- `guardian_user_links` — future parent-portal account linkage to the authoritative guardian person;
- RLS/helpers so authorized school roles can work with guardian information while a linked guardian can read their own relationships.

This intentionally avoids forcing guardian creation into initial learner registration. Schools can onboard/import learners first and link guardians afterward or through bulk reconciliation.

## Still planned / next

- Guardian management UI and **Save & link guardian** continuation from learner registration/profile.
- Bulk learner/staff/guardian import staging → validation → reconciliation → preview → governed commit.
- Subject-period attendance UI from the teacher timetable.
- Dedicated school late-arrival/detention UI and delegated late-arrival recorder workflow.
- Broader device QA after the remaining domain bulk implementation.

## Takeover rule

Do not replace the three attendance streams with one generic attendance table/view. Do not embed guardian identity as duplicated learner columns. Reuse the shared Picker/search/status/evidence patterns and existing design tokens.
