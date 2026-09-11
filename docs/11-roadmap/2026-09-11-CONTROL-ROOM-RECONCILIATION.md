# Control Room reconciliation — 11 September 2026

Authoritative source baseline: `90909aa79f8481c4053f7a752f99cf3a06aa52fe` (`main`).

This note supersedes stale coordination statements that describe source or connected-production migration parity only through PR #402/#404.

## Integrated after the previous roadmap baseline

- PR #405 — canonical `/library` operational completion: catalog title management, canonical configured subject selection, canonical grade/class filters, physical copy/stock management, CSV/XLSX-style import flow, class borrowing view, bulk class issue, bulk return, staff borrower visibility, canonical `issue_learning_resource(...)`, canonical `return_learning_resource(...)`, and preservation of #379 return finality.
- PR #407 — Room Inventory governed asset-register foundation, room visibility, custodian current-relationship hardening, and canonical assign/create/change/verify RPCs.
- PR #406 — Finance payments/banking rebuild, school payment settings, finance-manager-only raw settings access, sanitized payer-facing `get_school_payment_instructions(uuid)`, governed payment recording, and finance UI/runtime integration.

## Connected-production reconciliation

Supabase project: `jhgumnvhoxmapmgotchu` (`scolapro`).

Production parity was reconciled after `20260910123000_absence_review_scope_authorization` by applying the missing current-source Finance and Room Inventory migrations in dependency order. The Supabase migration connector records deployment-time ledger versions, so parity is classified by exact migration name/content and runtime object verification rather than by forcing source timestamp identity.

Applied deployment ledger entries:

- `20260911105700_school_payment_settings`
- `20260911105712_school_payment_settings_authorization`
- `20260911105801_room_inventory_foundation`
- `20260911105810_room_inventory_room_visibility`
- `20260911105823_room_inventory_custodian_relationship_hardening`

Verified Finance runtime/security state:

- `school_payment_settings` exists with RLS enabled;
- raw settings SELECT is finance-manager scoped;
- authenticated direct INSERT/UPDATE/DELETE is denied;
- `save_school_payment_settings(...)` exists;
- sanitized `get_school_payment_instructions(uuid)` exists;
- anon execution of payer RPC is denied;
- authenticated execution is allowed;
- current guardian/enrolment relationship checks are present.

Verified Room Inventory runtime/security state:

- `room_inventory_custodians`, `room_inventory_items`, `room_inventory_events`, and `room_inventory_verifications` exist with RLS;
- assign/create/change/verify RPCs exist;
- assigned-custodian room visibility policy exists;
- anon execution of the custodian helper is denied;
- current-custodian authorization checks current effective dates plus current `staff_school_assignments` or `school_memberships` relation to the room school.

## Current gates

- N06 — SOURCE-GATED. Do not invent Ministry Fifteenth School Day/AEC fields, codes, mappings, validation rules, or layouts.
- N11 — REQUIREMENTS-GATED. Generic assessment/moderation infrastructure does not establish authoritative coursework/moderation requirements.
- T12 — REQUIREMENTS-GATED. Administrator correction auto-approval remains a deferred product decision.

## Current coordinated work

No open pull requests were present at reconciliation time. No new source implementation gap was established. Remaining work is targeted LIVE-QA-GATED browser/device/real-data acceptance for source-integrated areas, including Library, Finance, Room Inventory, Absence Reviews, PR #400 visual corrections, communications provider cases, and bounded N22/N23 print/PDF/device scenarios.

Do not recreate integrated source merely because live acceptance remains unexercised. Any new source PR must be justified by a reproduced defect or a newly satisfied source/requirements gate.
