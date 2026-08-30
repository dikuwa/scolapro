# Recovery validation

Acceptance criteria for this branch are simple: application CI passes, database migrations reset cleanly, database lint has no errors, and the full pgTAP suite passes. No recovery change should widen anonymous access or expose private authorization helpers directly to clients.
