# Sports & Houses

## Purpose

ScolaPro treats inter-house organisation as a configurable school structure rather than hard-coding one school's house names, colours, age groups, or number of teams.

The first implementation phase is **Houses & Allocation**. It supports school houses, age-band configuration, learner and staff house membership, staff leadership, historical year-based reporting, and the data needed for a later assisted balancing workflow.

Competition disciplines, fixtures, athletics events, scores, medals, records, external school teams, and tournament management are intentionally a later Sports phase. They should build on the house foundation instead of being mixed into house allocation.

## School configuration

Each school may create any number of houses. A house has a name, optional short code, colour, display order, and active/inactive state. Examples such as Eagles, Sharks, and Cheetah are school data, never system constants.

Age groups are also school-defined. A school may use U14/U15/U16/U17/U20, U13/U15/U17/Open, Junior/Senior, or another structure. Age bands store a label and inclusive age range. The school/year configuration supplies the reference date used to calculate age. ScolaPro must not silently assume 31 December, the competition date, or the learner's age today.

## Year-scoped membership

House assignments are stored by school and academic year so historical reports remain correct. A learner or staff member can have only one house assignment in a school for a given year.

Assignments carry provenance (`automatic`, `manual`, `import`, or `carry_forward`) and a lock flag. A locked/manual assignment must not be overwritten by a future automatic balancing run.

A staff house assignment may be a normal member or the house leader. Phase 1 permits one active leader per house/year. Additional roles can be introduced later without changing learner membership.

## Assisted allocation design

Automatic allocation should be a **preview then apply** workflow, not a blind random redistribution.

For learners, the balancing engine should minimise imbalance across total house size and configured cohorts such as sex and age group. Grade may be included as an optional balancing dimension. Existing locked/manual assignments remain fixed; only eligible unassigned or explicitly unlocked learners are proposed for movement.

For staff, the engine should balance staff counts separately while preserving leaders and locked/manual placements.

The eventual allocation run should record its algorithm version, configuration snapshot, before/after totals, proposed moves, actor, and timestamp. This makes the process explainable and auditable.

## Continuity between years

Schools differ on whether house membership follows a learner throughout their school career or is redistributed annually. The data model therefore supports both behaviours. A future year-opening workflow can expose a school policy such as `carry_forward` or `rebalance_each_year`; this must be configurable rather than assumed globally.

## Reporting

The foundation must support at least:

- school + academic year
- house
- learner sex
- configured age group
- grade/register class when joined through enrolment
- assigned vs unassigned learners
- staff totals by house
- house leaders
- imbalance indicators once the allocation engine is implemented

## Integrity rules

- A house, learner/staff assignment, age group, and year setting must remain inside one tenant and school.
- A learner can only be assigned for a year in which they have an enrolment at that school.
- A staff member can only be assigned while they have a school placement overlapping that academic year.
- House leaders must be staff assigned to the same house/year.
- School members may read house structures and rosters; management writes are restricted to school administration/leadership and platform administration.
- No house name, colour, age group, or gender category is hard-coded for a particular school.
