-- Preserve the established resolve_late_detention terminal-state semantics: callers
-- reach the canonical "already resolved" guard before live mutation authorization is
-- evaluated. This keeps finality behavior/provenance stable while unresolved mutations
-- remain subject to the Wave 2 current-scope boundary.
create or replace function public.resolve_late_detention(
  p_obligation_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item public.late_detention_obligations%rowtype;
  v_supervisor_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('completed','waived') then
    raise exception 'Resolution must be completed or waived';
  end if;

  select * into v_item
  from public.late_detention_obligations
  where id = p_obligation_id;

  if not found then
    raise exception 'Detention obligation not found';
  end if;

  -- The canonical implementation checks this before its authorization branch. Delegate
  -- immediately so repeat completion/waiver retains the exact existing finality error.
  if v_item.status in ('completed','waived') then
    return public.resolve_late_detention_wave2_unscoped(
      p_obligation_id,
      p_status,
      p_note
    );
  end if;

  if p_status = 'completed'
     and not app_private.has_platform_role(array['platform_support']) then
    v_supervisor_allowed := app_private.is_assigned_late_detention_supervisor(p_obligation_id);
  end if;

  if not app_private.can_coordinate_current_detention_school(v_item.school_id, current_date)
     and not v_supervisor_allowed then
    raise exception 'Permission denied';
  end if;

  return public.resolve_late_detention_wave2_unscoped(
    p_obligation_id,
    p_status,
    p_note
  );
end;
$$;

revoke all on function public.resolve_late_detention(uuid,text,text) from public,anon;
grant execute on function public.resolve_late_detention(uuid,text,text) to authenticated;
