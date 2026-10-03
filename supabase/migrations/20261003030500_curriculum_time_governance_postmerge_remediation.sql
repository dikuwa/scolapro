-- Issue #1012 post-merge governance remediation.
-- Fixes Codex review findings without changing national source facts.

create or replace function app_private.curriculum_time_profile_supersedes(
  p_successor_profile_id uuid,
  p_predecessor_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $profile_supersession$
  with recursive chain(id,supersedes_profile_id,path) as (
    select p.id,p.supersedes_profile_id,array[p.id]::uuid[]
    from public.curriculum_time_profiles p
    where p.id=p_successor_profile_id

    union all

    select p.id,p.supersedes_profile_id,c.path||p.id
    from public.curriculum_time_profiles p
    join chain c on p.id=c.supersedes_profile_id
    where not p.id=any(c.path)
  )
  select coalesce(
    p_predecessor_profile_id is not null
    and p_predecessor_profile_id<>p_successor_profile_id
    and exists(
      select 1 from chain
      where id=p_predecessor_profile_id
    ),
    false
  );
$profile_supersession$;

revoke all on function app_private.curriculum_time_profile_supersedes(uuid,uuid)
from public,anon,authenticated;

-- Issue #1012 / Slice 5: platform governance UI boundaries for national curriculum time allocations.
-- Existing lifecycle/supersession guards remain authoritative. This migration adds:
-- 1) profile publication readiness across contained reviewed rules,
-- 2) a platform-admin conflict read model,
-- 3) one audited governance mutation RPC.

create or replace function app_private.guard_curriculum_time_profile_publication_readiness()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $profile_publication_readiness$
begin
  if new.status='published' and old.status is distinct from 'published' then
    perform app_private.require_verified_curriculum_time_source(new.source_id);

    if coalesce(new.provenance,'{}'::jsonb)='{}'::jsonb then
      raise exception 'Curriculum time profile publication requires profile provenance';
    end if;

    if exists(
      select 1
      from public.curriculum_time_allocations a
      where a.profile_id=new.id
        and (
          a.status<>'verified'
          or a.source_locator is null
          or btrim(a.source_locator)=''
        )
    ) then
      raise exception 'Curriculum time profile publication requires every contained allocation to be verified with a source locator';
    end if;

    if exists(
      select 1
      from public.curriculum_scheduling_constraints c
      join public.curriculum_time_allocations a on a.id=c.allocation_id
      where a.profile_id=new.id
        and (
          c.status<>'verified'
          or btrim(c.source_locator)=''
        )
    ) then
      raise exception 'Curriculum time profile publication requires every linked scheduling constraint to be verified with a source locator';
    end if;

    if exists(
      select 1
      from public.curriculum_time_allocations candidate
      join public.curriculum_time_allocations existing
        on existing.id<>candidate.id
       and existing.status='published'
      join public.curriculum_time_profiles existing_profile
        on existing_profile.id=existing.profile_id
       and existing_profile.status in ('published','superseded')
      where candidate.profile_id=new.id
        and candidate.status='verified'
        and existing_profile.cycle_kind=new.cycle_kind
        and existing_profile.cycle_length=new.cycle_length
        and greatest(
          coalesce(candidate.grade_from,0),
          coalesce(existing.grade_from,0)
        ) <= least(
          coalesce(candidate.grade_to,20),
          coalesce(existing.grade_to,20)
        )
        and greatest(
          new.effective_from_year,
          existing_profile.effective_from_year
        ) <= least(
          coalesce(new.effective_to_year,2200),
          coalesce(existing_profile.effective_to_year,2200)
        )
        and (
          (
            candidate.target_kind='subject'
            and existing.target_kind='subject'
            and candidate.curriculum_subject_id=existing.curriculum_subject_id
          )
          or
          (
            candidate.target_kind<>'subject'
            and existing.target_kind=candidate.target_kind
            and existing.allocation_key=candidate.allocation_key
          )
          or
          (
            candidate.target_kind='subject'
            and existing.target_kind<>'subject'
            and exists(
              select 1
              from public.curriculum_time_slot_subjects ss
              where ss.allocation_id=existing.id
                and ss.curriculum_subject_id=candidate.curriculum_subject_id
            )
          )
          or
          (
            existing.target_kind='subject'
            and candidate.target_kind<>'subject'
            and exists(
              select 1
              from public.curriculum_time_slot_subjects ss
              where ss.allocation_id=candidate.id
                and ss.curriculum_subject_id=existing.curriculum_subject_id
            )
          )
        )
        and candidate.supersedes_allocation_id is distinct from existing.id
        and not app_private.curriculum_time_profile_supersedes(new.id,existing.profile_id)
    ) then
      raise exception 'Curriculum time profile publication has an unresolved official allocation conflict';
    end if;
  end if;

  return new;
end;
$profile_publication_readiness$;

revoke all on function app_private.guard_curriculum_time_profile_publication_readiness()
from public,anon,authenticated;

drop trigger if exists zz_curriculum_time_profile_publication_readiness_trg
on public.curriculum_time_profiles;
create trigger zz_curriculum_time_profile_publication_readiness_trg
before update of status on public.curriculum_time_profiles
for each row execute function app_private.guard_curriculum_time_profile_publication_readiness();

create or replace function public.get_curriculum_time_governance_conflicts()
returns table(
  allocation_a_id uuid,
  allocation_b_id uuid,
  allocation_a_label text,
  allocation_b_label text,
  source_a_title text,
  source_b_title text,
  cycle_kind text,
  cycle_length smallint,
  grade_from smallint,
  grade_to smallint,
  effective_from_year integer,
  effective_to_year integer
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $governance_conflicts$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Platform administrator authority is required';
  end if;

  return query
  select
    a.id,
    b.id,
    a.display_label,
    b.display_label,
    sa.title,
    sb.title,
    pa.cycle_kind,
    pa.cycle_length,
    greatest(coalesce(a.grade_from,0),coalesce(b.grade_from,0))::smallint,
    least(coalesce(a.grade_to,20),coalesce(b.grade_to,20))::smallint,
    greatest(pa.effective_from_year,pb.effective_from_year),
    least(
      coalesce(pa.effective_to_year,2200),
      coalesce(pb.effective_to_year,2200)
    )
  from public.curriculum_time_allocations a
  join public.curriculum_time_allocations b
    on a.id<b.id
   and a.status='published'
   and b.status='published'
  join public.curriculum_time_profiles pa
    on pa.id=a.profile_id
   and pa.status in ('published','superseded')
  join public.curriculum_time_profiles pb
    on pb.id=b.profile_id
   and pb.status in ('published','superseded')
  join public.curriculum_sources sa on sa.id=pa.source_id
  join public.curriculum_sources sb on sb.id=pb.source_id
  where pa.cycle_kind=pb.cycle_kind
    and pa.cycle_length=pb.cycle_length
    and greatest(
      coalesce(a.grade_from,0),
      coalesce(b.grade_from,0)
    ) <= least(
      coalesce(a.grade_to,20),
      coalesce(b.grade_to,20)
    )
    and greatest(
      pa.effective_from_year,
      pb.effective_from_year
    ) <= least(
      coalesce(pa.effective_to_year,2200),
      coalesce(pb.effective_to_year,2200)
    )
    and (
      (
        a.target_kind='subject'
        and b.target_kind='subject'
        and a.curriculum_subject_id=b.curriculum_subject_id
      )
      or
      (
        a.target_kind<>'subject'
        and b.target_kind=a.target_kind
        and b.allocation_key=a.allocation_key
      )
      or
      (
        a.target_kind='subject'
        and b.target_kind<>'subject'
        and exists(
          select 1 from public.curriculum_time_slot_subjects ss
          where ss.allocation_id=b.id
            and ss.curriculum_subject_id=a.curriculum_subject_id
        )
      )
      or
      (
        b.target_kind='subject'
        and a.target_kind<>'subject'
        and exists(
          select 1 from public.curriculum_time_slot_subjects ss
          where ss.allocation_id=a.id
            and ss.curriculum_subject_id=b.curriculum_subject_id
        )
      )
    )
    and a.supersedes_allocation_id is distinct from b.id
    and b.supersedes_allocation_id is distinct from a.id
    and not app_private.curriculum_time_profile_supersedes(pa.id,pb.id)
    and not app_private.curriculum_time_profile_supersedes(pb.id,pa.id)
  order by pa.cycle_kind,pa.cycle_length,a.display_label,a.id,b.id;
end;
$governance_conflicts$;

revoke all on function public.get_curriculum_time_governance_conflicts()
from public,anon;
grant execute on function public.get_curriculum_time_governance_conflicts()
to authenticated;

create or replace function public.govern_curriculum_time_registry(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_related_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $govern_time_registry$
declare
  v_reason text:=nullif(btrim(p_reason),'');
  v_status text;
  v_source public.curriculum_sources%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Platform administrator authority is required';
  end if;
  if p_entity_id is null then
    raise exception 'Governance entity is required';
  end if;
  if p_entity_type not in ('source','profile','allocation','constraint') then
    raise exception 'Unsupported curriculum governance entity type';
  end if;
  if p_action not in ('verify','publish','withdraw','link_supersession','resolve_conflict') then
    raise exception 'Unsupported curriculum governance action';
  end if;

  if p_entity_type='source' then
    if p_action<>'verify' then
      raise exception 'Curriculum source governance currently supports verification only';
    end if;

    select * into v_source
    from public.curriculum_sources
    where id=p_entity_id
    for update;
    if not found then raise exception 'Curriculum source not found'; end if;

    if v_source.status not in ('discovered','imported','verified') then
      raise exception 'Curriculum source cannot be verified from its current status';
    end if;
    if v_source.source_url is null
       or btrim(v_source.source_url)=''
       or v_source.checksum is null
       or btrim(v_source.checksum)=''
       or coalesce(v_source.provenance,'{}'::jsonb)='{}'::jsonb then
      raise exception 'Source verification requires URL, checksum and provenance';
    end if;

    if v_source.status<>'verified' then
      update public.curriculum_sources
      set status='verified'
      where id=p_entity_id;

      insert into public.audit_events(
        actor_user_id,event_type,entity_type,entity_id,metadata
      )
      values(
        auth.uid(),
        'curriculum_time_source_verified',
        'curriculum_sources',
        p_entity_id,
        jsonb_build_object('source_scope','national_curriculum_time_registry')
      );
    end if;

    return jsonb_build_object(
      'entityType',p_entity_type,
      'entityId',p_entity_id,
      'status','verified'
    );
  end if;

  if p_action='resolve_conflict' then
    if p_entity_type<>'allocation' or p_related_id is null then
      raise exception 'Source conflict resolution requires winner and withdrawn allocation ids';
    end if;
    if v_reason is null then
      raise exception 'Source conflict resolution reason is required';
    end if;
    if char_length(v_reason)>1000 then
      raise exception 'Source conflict resolution reason is too long';
    end if;
    perform 1
    from public.curriculum_time_allocations
    where id in (p_entity_id,p_related_id)
    order by id
    for update;

    if not exists(
      select 1
      from public.get_curriculum_time_governance_conflicts() conflict
      where (
        conflict.allocation_a_id=p_entity_id
        and conflict.allocation_b_id=p_related_id
      )
      or (
        conflict.allocation_b_id=p_entity_id
        and conflict.allocation_a_id=p_related_id
      )
    ) then
      raise exception 'The selected allocations are not an unresolved published source conflict';
    end if;

    update public.curriculum_time_allocations
    set status='withdrawn'
    where id=p_related_id
      and status='published';

    if not found then
      raise exception 'Conflict loser must still be a published allocation';
    end if;

    insert into public.audit_events(
      actor_user_id,event_type,entity_type,entity_id,metadata
    )
    values(
      auth.uid(),
      'curriculum_time_source_conflict_resolved',
      'curriculum_time_allocations',
      p_related_id,
      jsonb_build_object(
        'source_scope','national_curriculum_time_registry',
        'kept_allocation_id',p_entity_id,
        'withdrawn_allocation_id',p_related_id,
        'reason',v_reason
      )
    );

    return jsonb_build_object(
      'entityType','allocation',
      'entityId',p_entity_id,
      'withdrawnAllocationId',p_related_id,
      'action','resolve_conflict'
    );
  end if;

  if p_action='link_supersession' then
    if p_related_id is null or p_related_id=p_entity_id then
      raise exception 'Supersession requires a distinct predecessor';
    end if;

    if p_entity_type='profile' then
      select status into v_status
      from public.curriculum_time_profiles
      where id=p_entity_id
      for update;
      if not found then raise exception 'Curriculum time profile not found'; end if;
      if v_status<>'draft' then raise exception 'Supersession must be linked while the successor is draft'; end if;
      update public.curriculum_time_profiles
      set supersedes_profile_id=p_related_id
      where id=p_entity_id;
    elsif p_entity_type='allocation' then
      select status into v_status
      from public.curriculum_time_allocations
      where id=p_entity_id
      for update;
      if not found then raise exception 'Curriculum time allocation not found'; end if;
      if v_status<>'draft' then raise exception 'Supersession must be linked while the successor is draft'; end if;
      update public.curriculum_time_allocations
      set supersedes_allocation_id=p_related_id
      where id=p_entity_id;
    else
      select status into v_status
      from public.curriculum_scheduling_constraints
      where id=p_entity_id
      for update;
      if not found then raise exception 'Curriculum scheduling constraint not found'; end if;
      if v_status<>'draft' then raise exception 'Supersession must be linked while the successor is draft'; end if;
      update public.curriculum_scheduling_constraints
      set supersedes_constraint_id=p_related_id
      where id=p_entity_id;
    end if;

    insert into public.audit_events(
      actor_user_id,event_type,entity_type,entity_id,metadata
    )
    values(
      auth.uid(),
      'curriculum_time_supersession_linked',
      case p_entity_type
        when 'profile' then 'curriculum_time_profiles'
        when 'allocation' then 'curriculum_time_allocations'
        else 'curriculum_scheduling_constraints'
      end,
      p_entity_id,
      jsonb_build_object(
        'source_scope','national_curriculum_time_registry',
        'predecessor_id',p_related_id
      )
    );

    return jsonb_build_object(
      'entityType',p_entity_type,
      'entityId',p_entity_id,
      'predecessorId',p_related_id,
      'action','link_supersession'
    );
  end if;

  if p_entity_type='profile' then
    select status into v_status
    from public.curriculum_time_profiles
    where id=p_entity_id
    for update;
    if not found then raise exception 'Curriculum time profile not found'; end if;

    if p_action='verify' then
      if v_status not in ('draft','verified') then
        raise exception 'Only draft curriculum time profiles may be verified';
      end if;
      update public.curriculum_time_profiles set status='verified' where id=p_entity_id;
    elsif p_action='publish' then
      if v_status<>'verified' then
        raise exception 'Curriculum time profile must be verified before publication';
      end if;
      if not exists(
        select 1
        from public.curriculum_time_allocations a
        where a.profile_id=p_entity_id
      ) then
        raise exception 'Curriculum time profile publication requires at least one reviewed allocation';
      end if;
      update public.curriculum_time_profiles set status='published' where id=p_entity_id;
    elsif p_action='withdraw' then
      if v_status not in ('published','superseded','withdrawn') then
        raise exception 'Only published or superseded curriculum time profiles may be withdrawn';
      end if;
      update public.curriculum_time_profiles set status='withdrawn' where id=p_entity_id;
    end if;
  elsif p_entity_type='allocation' then
    select status into v_status
    from public.curriculum_time_allocations
    where id=p_entity_id
    for update;
    if not found then raise exception 'Curriculum time allocation not found'; end if;

    if p_action='verify' then
      if v_status not in ('draft','verified') then
        raise exception 'Only draft curriculum time allocations may be verified';
      end if;
      update public.curriculum_time_allocations set status='verified' where id=p_entity_id;
    elsif p_action='publish' then
      if v_status<>'verified' then
        raise exception 'Curriculum time allocation must be verified before publication';
      end if;
      update public.curriculum_time_allocations set status='published' where id=p_entity_id;
    elsif p_action='withdraw' then
      if v_status not in ('published','superseded','withdrawn') then
        raise exception 'Only published or superseded curriculum time allocations may be withdrawn';
      end if;
      update public.curriculum_time_allocations set status='withdrawn' where id=p_entity_id;
    end if;
  else
    select status into v_status
    from public.curriculum_scheduling_constraints
    where id=p_entity_id
    for update;
    if not found then raise exception 'Curriculum scheduling constraint not found'; end if;

    if p_action='verify' then
      if v_status not in ('draft','verified') then
        raise exception 'Only draft curriculum scheduling constraints may be verified';
      end if;
      update public.curriculum_scheduling_constraints set status='verified' where id=p_entity_id;
    elsif p_action='publish' then
      if v_status<>'verified' then
        raise exception 'Curriculum scheduling constraint must be verified before publication';
      end if;
      update public.curriculum_scheduling_constraints set status='published' where id=p_entity_id;
    elsif p_action='withdraw' then
      if v_status not in ('published','superseded','withdrawn') then
        raise exception 'Only published or superseded curriculum scheduling constraints may be withdrawn';
      end if;
      update public.curriculum_scheduling_constraints set status='withdrawn' where id=p_entity_id;
    end if;
  end if;

  select case p_entity_type
    when 'profile' then (select status from public.curriculum_time_profiles where id=p_entity_id)
    when 'allocation' then (select status from public.curriculum_time_allocations where id=p_entity_id)
    else (select status from public.curriculum_scheduling_constraints where id=p_entity_id)
  end into v_status;

  return jsonb_build_object(
    'entityType',p_entity_type,
    'entityId',p_entity_id,
    'status',v_status,
    'action',p_action
  );
end;
$govern_time_registry$;

revoke all on function public.govern_curriculum_time_registry(
  text,uuid,text,uuid,text
) from public,anon;
grant execute on function public.govern_curriculum_time_registry(
  text,uuid,text,uuid,text
) to authenticated;

comment on function public.get_curriculum_time_governance_conflicts() is
'Platform-admin-only read model for unresolved published curriculum-time source conflicts. Conflict means the same canonical target overlaps in exact cycle, grade and effective-year scope without explicit supersession.';
comment on function public.govern_curriculum_time_registry(text,uuid,text,uuid,text) is
'Platform-admin-only human governance boundary for source verification, lifecycle review, draft supersession linkage and explicit published conflict resolution. Existing registry triggers remain authoritative.';

create or replace function app_private.enforce_published_curriculum_time_profile_nonempty()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $published_profile_nonempty$
begin
  if exists(
    select 1
    from public.curriculum_time_profiles p
    where p.id=new.id
      and p.status='published'
  )
  and not exists(
    select 1
    from public.curriculum_time_allocations a
    where a.profile_id=new.id
  ) then
    raise exception 'Curriculum time profile publication requires at least one reviewed allocation';
  end if;

  return null;
end;
$published_profile_nonempty$;

revoke all on function app_private.enforce_published_curriculum_time_profile_nonempty()
from public,anon,authenticated;

drop trigger if exists zz_curriculum_time_profile_nonempty_publication_ctr
on public.curriculum_time_profiles;
create constraint trigger zz_curriculum_time_profile_nonempty_publication_ctr
after insert or update of status on public.curriculum_time_profiles
deferrable initially deferred
for each row execute function app_private.enforce_published_curriculum_time_profile_nonempty();

comment on function app_private.curriculum_time_profile_supersedes(uuid,uuid) is
'Returns true when the first curriculum-time profile explicitly supersedes the second through its governed predecessor chain.';
comment on function app_private.enforce_published_curriculum_time_profile_nonempty() is
'Deferred database-wide invariant: a transaction may stage profile-first, but it may not commit a published curriculum-time profile with no reviewed allocation.';


-- Align allocation publication with the resolver's profile-level supersession semantics.
create or replace function app_private.guard_curriculum_time_allocation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $allocation_guard$
declare
  v_profile public.curriculum_time_profiles%rowtype;
  v_version_subject_id uuid;
  v_conflict boolean:=false;
  v_content_changed boolean:=false;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Only draft curriculum time allocations may be deleted';
    end if;
    return old;
  end if;

  if tg_op='INSERT' and new.status<>'draft' then
    raise exception 'Curriculum time allocations must begin in draft state';
  end if;

  select * into v_profile
  from public.curriculum_time_profiles
  where id=new.profile_id;
  if not found then raise exception 'Curriculum time profile not found'; end if;

  if new.curriculum_version_id is not null then
    select curriculum_subject_id into v_version_subject_id
    from public.curriculum_versions
    where id=new.curriculum_version_id;
    if v_version_subject_id is null
       or v_version_subject_id is distinct from new.curriculum_subject_id then
      raise exception 'Curriculum time allocation version does not match its canonical curriculum subject';
    end if;
  end if;

  if new.supersedes_allocation_id is not null then
    if not exists(
      select 1
      from public.curriculum_time_allocations previous
      where previous.id=new.supersedes_allocation_id
        and (
          (new.target_kind='subject' and previous.target_kind='subject' and previous.curriculum_subject_id=new.curriculum_subject_id)
          or
          (new.target_kind<>'subject' and previous.target_kind=new.target_kind and previous.allocation_key=new.allocation_key)
          or
          (
            new.target_kind='subject'
            and previous.target_kind<>'subject'
            and exists(
              select 1
              from public.curriculum_time_slot_subjects slot_subject
              where slot_subject.allocation_id=previous.id
                and slot_subject.curriculum_subject_id=new.curriculum_subject_id
            )
          )
        )
    ) then
      raise exception 'Superseded curriculum time allocation must describe the same canonical target';
    end if;
  end if;

  if tg_op='UPDATE' then
    v_content_changed :=
      new.profile_id is distinct from old.profile_id
      or new.curriculum_subject_id is distinct from old.curriculum_subject_id
      or new.curriculum_version_id is distinct from old.curriculum_version_id
      or new.allocation_key is distinct from old.allocation_key
      or new.target_kind is distinct from old.target_kind
      or new.display_label is distinct from old.display_label
      or new.grade_from is distinct from old.grade_from
      or new.grade_to is distinct from old.grade_to
      or new.periods_per_cycle is distinct from old.periods_per_cycle
      or new.percentage_time is distinct from old.percentage_time
      or new.rule_strength is distinct from old.rule_strength
      or new.source_locator is distinct from old.source_locator
      or new.notes is distinct from old.notes
      or new.supersedes_allocation_id is distinct from old.supersedes_allocation_id
      or new.created_at is distinct from old.created_at;

    if old.status='verified' and v_content_changed and new.status<>'draft' then
      raise exception 'Verified curriculum time allocation must return to draft before content is changed';
    end if;
  end if;

  if new.status='draft' then
    new.verified_by_user_id:=null;
    new.verified_at:=null;
    new.conflict_acknowledged_by_user_id:=null;
    new.conflict_acknowledged_at:=null;
  elsif new.status='verified' and (tg_op='INSERT' or old.status is distinct from 'verified') then
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    new.verified_by_user_id:=auth.uid();
    new.verified_at:=now();
  end if;

  if (old.status='draft' and new.status not in ('draft','verified'))
     or (old.status='verified' and new.status not in ('draft','verified','published'))
     or (old.status='published' and new.status not in ('published','superseded','withdrawn'))
     or (old.status='superseded' and new.status not in ('superseded','withdrawn'))
     or (old.status='withdrawn' and new.status<>'withdrawn') then
    raise exception 'Curriculum time allocation lifecycle transition is not allowed';
  end if;

  if new.status='published' and old.status<>'verified' then
    raise exception 'Curriculum time allocation must be verified before publication';
  end if;

  if new.status='published' then
    if v_profile.status<>'published' then
      raise exception 'Curriculum time allocations can only be published under a published profile';
    end if;
    if new.source_locator is null or btrim(new.source_locator)='' then
      raise exception 'Published curriculum time allocations require a source locator';
    end if;

    select exists(
      select 1
      from public.curriculum_time_allocations other
      join public.curriculum_time_profiles other_profile on other_profile.id=other.profile_id
      where other.id<>new.id
        and other.status='published'
        and other_profile.status='published'
        and other_profile.cycle_kind=v_profile.cycle_kind
        and other_profile.cycle_length=v_profile.cycle_length
        and other_profile.effective_from_year<=coalesce(v_profile.effective_to_year,2200)
        and coalesce(other_profile.effective_to_year,2200)>=v_profile.effective_from_year
        and coalesce(other.grade_from,0)<=coalesce(new.grade_to,20)
        and coalesce(other.grade_to,20)>=coalesce(new.grade_from,0)
        and (
          (new.target_kind='subject' and other.target_kind='subject' and other.curriculum_subject_id=new.curriculum_subject_id)
          or
          (new.target_kind<>'subject' and other.target_kind=new.target_kind and other.allocation_key=new.allocation_key)
        )
        and other.id is distinct from new.supersedes_allocation_id
        and other.supersedes_allocation_id is distinct from new.id
        and not app_private.curriculum_time_profile_supersedes(new.profile_id,other.profile_id)
        and not app_private.curriculum_time_profile_supersedes(other.profile_id,new.profile_id)
    ) into v_conflict;

    if v_conflict then
      if new.conflict_acknowledgement_reason is null or btrim(new.conflict_acknowledgement_reason)='' then
        raise exception 'Publishing this curriculum time allocation would create an unresolved source conflict';
      end if;
      if auth.uid() is null then raise exception 'Authentication required'; end if;
      new.conflict_acknowledged_by_user_id:=auth.uid();
      new.conflict_acknowledged_at:=now();
    end if;
  end if;

  if tg_op='UPDATE' and old.status in ('published','superseded','withdrawn') then
    if old.status='withdrawn' and new.status<>'withdrawn' then
      raise exception 'Withdrawn curriculum time allocations cannot return to an active lifecycle state';
    end if;
    if old.status='superseded' and new.status not in ('superseded','withdrawn') then
      raise exception 'Superseded curriculum time allocations cannot return to an active lifecycle state';
    end if;
    if old.status='published' and new.status not in ('published','superseded','withdrawn') then
      raise exception 'Published curriculum time allocations cannot return to a mutable lifecycle state';
    end if;
    if v_content_changed
      or new.verified_by_user_id is distinct from old.verified_by_user_id
      or new.verified_at is distinct from old.verified_at
      or new.conflict_acknowledged_by_user_id is distinct from old.conflict_acknowledged_by_user_id
      or new.conflict_acknowledged_at is distinct from old.conflict_acknowledged_at then
      raise exception 'Published curriculum time allocation content and provenance are immutable';
    end if;
  end if;

  new.updated_at:=now();
  return new;
end;
$allocation_guard$;


revoke all on function app_private.guard_curriculum_time_allocation()
from public,anon,authenticated;
