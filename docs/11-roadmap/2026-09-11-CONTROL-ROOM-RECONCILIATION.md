# Control Room reconciliation — 11 September 2026

Authoritative source baseline: `e32075a5b07bf9eba870605fe119f5f6e3fe350e` (`main`).

This note supersedes stale coordination statements that predate PR #411 and the completed source/live migration reconciliation.

## Integrated current baseline

- PR #405 — canonical `/library` operational completion: catalog title management, canonical configured subject selection, canonical grade/class filters, physical copy/stock management, CSV/XLSX-style import flow, class borrowing view, bulk class issue, bulk return, staff borrower visibility, canonical `issue_learning_resource(...)`, canonical `return_learning_resource(...)`, and preservation of #379 return finality.
- PR #406 — Finance payments/banking rebuild, school payment settings, finance-manager-only raw settings access, sanitized payer-facing `get_school_payment_instructions(uuid)`, governed payment recording, and finance UI/runtime integration.
- PR #407 — Room Inventory governed asset-register foundation, room visibility, custodian current-relationship hardening, and canonical assign/create/change/verify RPCs.
- PR #409 — repository migration-history bridge reconciliation for 117 exact remote deployment-time versions using the existing no-op bridge convention. No schema DDL, RLS/RPC, application runtime, or production-ledger repair was introduced. Exact-head Application CI #2080 and Database #1420 passed; post-merge Supabase reconciliation succeeded.
- PR #410 — restored the verified PR #400 branded route-loading token (`--brand`) after a later merge regressed it to `--background`. Application CI #2082 passed; post-merge quality and Supabase checks passed.
- PR #411 — corrected multi-school shell/navigation and learner/staff operational scope so roles are composed only inside one deterministic current-school context. Cross-school role capabilities are not inherited into current-school navigation; `/learners`, learner detail, cumulative record, and `/staff` bind to that same school boundary; School Admin-only learner registration and late-arrival delegated-duty binding remain enforced. Exact-head Application CI #2093 passed; no database changes were required.

## Connected-production reconciliation

Supabase project: `jhgumnvhoxmapmgotchu` (`scolapro`).

Source/live migration parity is complete at `665/665` migration identities. The latest source and deployed migration is `20260910191000_room_inventory_custodian_relationship_hardening`. No real source migration is missing from production and no live ledger version lacks a current-main source file. PR #409 bridge identities remain reconciled without replaying historical DDL.

One historical ledger row stores an empty statement array. This is not classified as drift because version/name identity and targeted object verification reconcile it. Migration parity is therefore established by source/deployed identity plus runtime-object verification, not by requiring every historical ledger row to retain a statement payload.

Current deployment identity is aligned with authoritative `main`. Production application deployment was verified on the integrated main lineage with Vercel success, and Supabase main-branch reconciliation checks are green. Post-#411 main Supabase Preview succeeded; GitHub quality must remain green before treating any later main SHA as fully integrated.

## Runtime/security verification state

Read-only connected-production inspection confirms the integrated Library, Finance, Room Inventory, Absence Review, communications, and report-output schema/runtime objects exist with their expected RLS/policy and canonical RPC/function boundaries. Canonical operational RPCs deny anon execution and allow authenticated execution where intended.

This verification is limited to object identity, RLS enablement, policy presence, grants, and source/live migration parity. It does not claim authenticated browser/workspace acceptance, real communications-provider delivery, or real report-card rendering.

Current operational readiness:

- Library — deployed; no representative `learning_resource_titles`/copies/loans data available for live circulation acceptance.
- Finance — deployed; `school_payment_settings` and payment data lack representative production rows for live acceptance.
- Room Inventory — deployed; inventory/custodian/event/verification tables lack representative production rows.
- Absence Reviews — deployed; authenticated browser/workspace execution is still required for acceptance.
- Communications — deployed; no provider routes are configured, so real provider-delivery acceptance requires external provider configuration.
- Report output — deployed; no render jobs/documents currently exist, so authenticated report generation and device/PDF acceptance remain unexercised.

No production data was seeded, sent, generated, or mutated merely to manufacture acceptance evidence.

## Current gates

- N06 — SOURCE-GATED. Do not invent Ministry Fifteenth School Day/AEC fields, codes, mappings, validation rules, or layouts.
- N11 — REQUIREMENTS-GATED. Generic assessment/moderation infrastructure does not establish authoritative coursework/moderation requirements.
- T12 — REQUIREMENTS-GATED. Administrator correction auto-approval remains a deferred product decision.

## Current coordinated work

No ungated source implementation gap is currently established beyond defects reproduced by QA/review. Remaining coordinated work is LIVE-QA-GATED browser/device/real-data acceptance for integrated areas, including Library, Finance, Room Inventory, Absence Reviews, PR #400/#410 visual corrections, communications provider cases, and bounded N22/N23 print/PDF/device scenarios.

Do not recreate integrated source merely because live acceptance remains unexercised. Any new source PR must be justified by a reproduced defect or a newly satisfied source/requirements gate.
