# ADR-0005: Offline Mutation Queue with Explicit Conflict Handling

## Status
Accepted

## Context
ScolaPro must remain useful in schools with unreliable connectivity. Critical teacher workflows cannot depend on a continuously available network, but silent last-write-wins would risk academic and attendance corruption.

## Decision
Use an IndexedDB-backed client cache and durable mutation queue for selected offline-capable workflows. Server writes are idempotent and version-aware. Conflicting changes are surfaced for explicit resolution rather than silently overwritten.

## Initial offline scope
- attendance;
- lesson-preparation drafts;
- lesson delivery/coverage records;
- marks drafts during open windows;
- selected LTSM issue/return actions.

Privileged certification, access-control and destructive administration remain online-first initially.

## Consequences
### Positive
- Schools can continue core work through outages.
- User intent is preserved until synchronization succeeds.
- Conflicts are visible rather than silently corrupting official records.

### Costs
- Every offline-capable mutation needs idempotency and version semantics.
- Testing must include stale rosters, locked mark windows and conflicting edits.
- Client cache security and context clearing are mandatory.

## Rejected alternative
Treating offline as generic HTTP/service-worker caching. This does not provide reliable business mutation semantics.
