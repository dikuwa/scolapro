-- SECURITY DEFINER functions remain callable by authenticated users only where
-- the function itself performs explicit role/scope checks. Trigger-only
-- functions are not callable through the exposed RPC API.

revoke all on function public.upsert_school_subject(uuid,text,text) from public, anon;
grant execute on function public.upsert_school_subject(uuid,text,text) to authenticated;

revoke all on function public.upsert_subject_offering(uuid,integer,uuid,uuid,smallint) from public, anon;
grant execute on function public.upsert_subject_offering(uuid,integer,uuid,uuid,smallint) to authenticated;

revoke all on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) from public, anon;
grant execute on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) to authenticated;

revoke all on function public.upsert_timetable_period(uuid,integer,smallint,text,time,time,boolean) from public, anon;
grant execute on function public.upsert_timetable_period(uuid,integer,smallint,text,time,time,boolean) to authenticated;

revoke all on function public.create_timetable_slot(uuid,integer,text,smallint,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.create_timetable_slot(uuid,integer,text,smallint,uuid,uuid,uuid,text) to authenticated;

-- Trigger functions should never be exposed as callable API RPCs.
revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;
revoke all on function public.notify_school_invitation_status_change() from public, anon, authenticated;
