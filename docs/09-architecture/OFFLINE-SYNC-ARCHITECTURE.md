# ScolaPro Offline Sync Architecture

## Goal
Allow critical school work to continue on unreliable or intermittent connectivity without creating silent data corruption.

## Offline-first scope
Initial offline support should prioritize workflows that are both frequent and operationally important:
- class/register attendance;
- subject-period attendance;
- teacher lesson-preparation drafts;
- lesson delivery/coverage notes;
- simple learner notes where permitted;
- marks entry drafts within an open marks window;
- LTSM barcode issue/return queue where practical.

Highly privileged or destructive actions should remain online-first until conflict handling is proven, including role changes, statutory certification, final promotion decisions, result unlocking and tenant administration.

## Client storage
Use IndexedDB as the browser/PWA persistence layer. Do not rely on localStorage for structured offline business data.

Recommended local stores:
- reference cache;
- scoped roster/cache data;
- draft records;
- mutation queue;
- sync metadata;
- conflict records.

All cached data must be scoped by user, tenant and school context.

## Mutation queue
Every offline mutation receives:
- client-generated UUID;
- tenant/school context;
- entity/action type;
- payload;
- client timestamp;
- base server version/etag when editing existing records;
- status: pending, syncing, accepted, conflicted, rejected.

The client must be able to retry safely without creating duplicates. Server endpoints therefore require idempotency support for queued mutations.

## Conflict strategy
Do not use universal last-write-wins.

### Safe merge candidates
- independent lesson-preparation text sections;
- separate attendance observations for different learners/dates;
- new append-only notes/events.

### Explicit conflict candidates
- same learner attendance observation edited by two users;
- same raw mark changed on multiple devices;
- class membership changed while an offline attendance roster is stale;
- stock item issued to two learners offline.

Conflicts should show human-readable differences and allow an authorized user to resolve them.

## Versioning
Mutable server records used offline should expose a monotonically increasing revision/version or reliable `updated_at` token. Offline writes carry the version they were based on.

## Attendance specifics
Offline attendance must preserve:
- actual attendance date/session;
- time recorded on device;
- time accepted by server;
- recorder identity;
- reason/status.

If the learner is no longer valid for the class/session when sync occurs, do not silently discard the record; surface a reconciliation exception.

## Marks specifics
Marks may be drafted offline only while the assessment window was known to be open. During sync, server state remains authoritative. If an administrator locked the assessment while the teacher was offline, queued changes are not silently applied; they become a review exception.

## Data minimization
Only cache data required for the user's current scopes and likely near-term tasks. Do not mirror the full school database into every device.

Sensitive learner-support data should not be broadly cached offline in the first release. If later supported, it requires stronger device/session controls and explicit threat review.

## Sync lifecycle
1. Authenticate online and establish tenant/school scope.
2. Download bounded reference/working data.
3. User works online or offline.
4. Local mutations enter durable queue.
5. Connectivity returns.
6. Queue syncs in creation order where dependencies matter.
7. Server validates authorization, workflow state and version.
8. Accepted mutations receive canonical server state.
9. Conflicts/rejections remain visible until resolved.

## Connectivity UX
The application must clearly distinguish:
- Online
- Offline — changes saved on this device
- Syncing
- Some changes need attention

Never show a generic success message implying server persistence while the operation is still only local.

## PWA caching
Service worker caching should prioritize application shell and stable reference assets. API business data is managed deliberately through IndexedDB rather than opaque stale HTTP caching.

## Security
- clear scoped offline caches on logout/context switch;
- never store service-role credentials client-side;
- minimize personally identifiable data cached on shared devices;
- support forced cache invalidation when membership/role access is revoked on next connection.

## Status
Approved baseline. Offline support is a product capability, not a late-stage service-worker patch.