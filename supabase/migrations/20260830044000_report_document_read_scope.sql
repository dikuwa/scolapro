-- Report-card documents are artifacts of immutable snapshots and must never expose a
-- broader audience than the snapshot they represent. The snapshot policy already uses
-- the relationship-aware read helper; converge the document policy onto the same rule.

drop policy if exists "authorized users read report card documents" on public.report_card_documents;
drop policy if exists "scoped users read report card documents" on public.report_card_documents;

create policy "scoped users read report card documents"
on public.report_card_documents for select to authenticated
using (
  exists (
    select 1
    from public.report_card_snapshots rs
    where rs.id=report_card_documents.snapshot_id
      and rs.school_id=report_card_documents.school_id
      and rs.tenant_id=report_card_documents.tenant_id
      and app_private.can_read_report_card_snapshot(rs.school_id,rs.learner_id,rs.status)
  )
);

comment on policy "scoped users read report card documents" on public.report_card_documents is
'Report artifact visibility is exactly bounded by the relationship-aware report-card snapshot read scope; teacher/class-teacher and guardian access cannot exceed the source snapshot.';
