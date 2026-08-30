# Backend CI recovery — 2026-08-30

This recovery pass was triggered while validating the configurable Sports & Houses foundation. The sports migration and sports regression test were green; the full database workflow exposed unrelated regressions already present on `main`.

## Repaired boundaries

- Communication-ledger RLS now calls a narrow authenticated security-definer policy predicate while the deeper authorization helper remains non-client-executable.
- Guardian-import commit execution pins PL/pgSQL variable precedence to keep guardian/address variable references deterministic under database linting.
- Guardian import behavior coverage now matches the current deliberate rule: an exact identity/name match is a valid deterministic link, while an identity/name mismatch is a warning requiring explicit human confirmation and must not rewrite canonical identity data.
- Promotion attendance readiness fixtures follow the enforced draft → conditions → active rule-version lifecycle.
- Report-card attendance fixtures call the governed report-card RPC with its canonical `smallint` term signature.
- Security-definer anonymous-execution coverage no longer relies on a collation-sensitive pgTAP result-set comparison.

No product permission was widened: parents still use the parent message overview instead of browsing the canonical communication ledger, and deeper authorization helpers remain private.
