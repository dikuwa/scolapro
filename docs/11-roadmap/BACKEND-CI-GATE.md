# Backend CI gate

Backend feature branches must not be merged while the full Database workflow is red, even when the feature-specific regression test passes. A red database gate is treated as repository integrity debt and repaired first on an isolated backend branch.

This rule was applied to the Sports & Houses foundation on 2026-08-30: its feature test passed, but unrelated guardian import, communication-policy, promotion-fixture, report-card-signature, and security-boundary regressions were surfaced by the full suite and moved into a separate recovery branch before Sports is merged.
