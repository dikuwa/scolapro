# Sports & Houses

## Purpose

ScolaPro treats inter-house organisation as a configurable school structure rather than hard-coding one school's house names, colours, age groups, or number of teams.

The first implementation phase is **Houses & Allocation**. It supports school houses, age-band configuration, learner and staff house membership, staff leadership, historical year-based reporting, and the data needed for a later assisted balancing workflow.

Competition disciplines, fixtures, athletics events, scores, medals, records, external school teams, and tournament management are intentionally a later Sports phase. They should build on the house foundation instead of being mixed into house allocation.

## School configuration

Each school may create any number of houses. A house has a name, optional short code, colour, display order, and active/inactive state. House names and colours are school data, never system constants.

Age groups are school-defined. A school may use U14/U15/U16/U17/U20, U13/U15/U17/Open, Junior/Senior, or another structure. Age bands store a label and inclusive age range. Active age bands may not overlap, because one learner must resolve deterministically to at most one active age group.

The school/year configuration supplies the reference date used to calculate age. ScolaPro must not silently assume 31 December, the competition date, or the learner's age today.

## Year-scoped membership

House assignments are stored by school and academic year so historical reports remain correct. A learner or staff member can have only one house assignment in a school for a given year.

Assignments carry provenance (`automatic`, `manual`, `import`, or `carry_forward`) and a lock flag. A locked/manual assignment must not be overwritten by a future automatic balancing run without an explicit governed decision.

A staff house assignment may be a normal member or the house leader. Phase 1 permits one leader per house/year. Additional roles can be introduced later without changing learner membership.

## Governed mutation boundary

Authenticated clients may read house structures and assignments according to school RLS scope, but they do not receive raw INSERT/UPDATE/DELETE privileges on the Sports & Houses tables. Configuration and assignment changes go through security-definer RPCs that re-check the actor's school-management authority and the school/tenant/person relationship before writing.

School sports management is currently available to School Administration, Principal, Deputy Principal, and Platform Administration. Ordinary teaching membership is read-only.

## Assisted allocation design

Automatic allocation should be a **preview then apply** workflow, not a blind random redistribution.

For learners, the balancing engine should minimise imbalance across total house size and configured cohorts such as sex and age group. Grade may be included as an optional balancing dimension. Existing locked/manual assignments remain fixed; only eligible unassigned or explicitly unlocked learners are proposed for movement.

For staff, the engine should balance staff counts separately while preserving leaders and locked/manual placements.

The eventual allocation run should record its algorithm version, configuration snapshot, before/after totals, proposed moves, actor, and timestamp. This makes the process explainable and auditable.

## Continuity between years

Schools differ on whether house membership follows a learner throughout their school career or is redistributed annually. The data model supports both behaviours through `carry_forward` and `rebalance_each_year`. A later year-opening workflow should apply the configured policy rather than assuming one globally.

## Reporting

The foundation supports school + academic year, house, learner sex, configured age group, grade/register class, assignment provenance, lock state, staff membership, and house leadership. Later balancing analytics can add unassigned counts and imbalance indicators without changing the core identity model.

## Integrity rules

- A house, learner/staff assignment, age group, and year setting must remain inside one tenant and school.
- A learner can only be assigned for a year in which they have an enrolment at that school.
- A staff member can only be assigned while they have a school placement overlapping that academic year.
- A house used by an assignment must belong to the same school and tenant as the assignment.
- One learner or staff member has at most one house assignment per school/year.
- A house has at most one staff leader per school/year.
- Active age bands cannot overlap.
- Raw authenticated table mutation is closed; governed RPCs own writes.
- No house name, colour, age group, or balancing cohort value is hard-coded for a particular school.
