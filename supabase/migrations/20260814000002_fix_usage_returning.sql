-- record_usage_snapshot의 모호한 컬럼 참조 수정
--
-- 0005의 확정값 upsert가 `returning cumulative_seconds into v_confirmed`로 끝나는데,
-- 이 함수에는 같은 이름의 파라미터가 있다. plpgsql은 컬럼과 변수 중 무엇을 가리키는지
-- 판단하지 못하고 42702(ambiguous column reference)로 죽는다.
--
-- 거절 경로는 그 문장에 닿기 전에 예외를 던지기 때문에 전부 정상으로 보였고,
-- **성공 경로만** 실패했다. 검증에서 "거절은 다 되는데 기록만 안 된다"는 모양으로
-- 드러났다.
--
-- 파라미터 이름은 클라이언트 계약(UsageSnapshot.cumulativeSeconds)과 맞춰 둔 것이라
-- 바꾸지 않고, returning 쪽을 테이블 이름으로 한정한다.

create or replace function public.record_usage_snapshot(
  target_device_id uuid,
  target_group_id uuid,
  period_start timestamptz,
  cumulative_seconds int,
  collected_at timestamptz,
  permission_state public.permission_state,
  source public.usage_source,
  sequence bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_device public.devices;
  v_group public.groups;
  v_rule public.group_rules;
  v_time_zone text;
  v_reset_hour int;
  v_period_end timestamptz;
  v_inserted boolean := false;
  v_confirmed int;
  v_status text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if cumulative_seconds is null or cumulative_seconds < 0 then
    raise exception '누적 사용 시간이 올바르지 않습니다.'
      using errcode = 'PT400', hint = 'invalid_cumulative_seconds';
  end if;

  select * into v_device
    from public.devices d
   where d.id = target_device_id
     and d.profile_id = v_actor;

  if not found then
    raise exception '등록되지 않은 기기입니다.'
      using errcode = 'PT404', hint = 'device_not_found';
  end if;

  if not v_device.is_active then
    raise exception '비활성 기기의 사용량은 받지 않습니다.'
      using errcode = 'PT409', hint = 'device_inactive';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  if v_group.status <> 'active' then
    raise exception '집계 중인 그룹이 아닙니다.'
      using errcode = 'PT409', hint = 'group_not_collecting';
  end if;

  v_rule := public.effective_rule(v_group.id, period_start);
  v_time_zone := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset_hour := coalesce(v_rule.reset_hour, 6);
  v_period_end := public.frimit_next_period_start(period_start, v_time_zone, v_reset_hour);

  if period_start is distinct from
     public.frimit_period_start(period_start, v_time_zone, v_reset_hour) then
    raise exception '집계 구간의 시작이 올바르지 않습니다.'
      using errcode = 'PT400', hint = 'invalid_period_start';
  end if;

  if period_start > now() then
    raise exception '아직 오지 않은 구간입니다.'
      using errcode = 'PT400', hint = 'future_period';
  end if;

  if period_start < now() - interval '7 days' then
    raise exception '너무 오래된 구간입니다.'
      using errcode = 'PT409', hint = 'period_too_old';
  end if;

  if not exists (
    select 1 from public.period_member_ids(v_group.id, period_start, v_period_end) as pid
     where pid = v_actor
  ) then
    raise exception '그 기간에는 이 그룹의 집계 대상이 아닙니다.'
      using errcode = 'PT409', hint = 'not_in_period';
  end if;

  insert into public.usage_snapshots (
    device_id, group_id, profile_id, period_start,
    cumulative_seconds, collected_at, permission_state, source, sequence
  ) values (
    target_device_id, v_group.id, v_actor, period_start,
    cumulative_seconds, collected_at, permission_state, source, sequence
  )
  on conflict on constraint one_snapshot_per_sequence do nothing;

  v_inserted := found;

  insert into public.daily_member_usage (
    group_id, profile_id, period_start, date_key, cumulative_seconds,
    last_collected_at, last_sequence, source, permission_state
  ) values (
    v_group.id, v_actor, period_start,
    public.frimit_date_key(period_start, v_time_zone, v_reset_hour),
    cumulative_seconds, collected_at, sequence, source, permission_state
  )
  on conflict on constraint one_row_per_member_period do update
    set cumulative_seconds = greatest(
          daily_member_usage.cumulative_seconds,
          excluded.cumulative_seconds
        ),
        last_collected_at = greatest(
          daily_member_usage.last_collected_at,
          excluded.last_collected_at
        ),
        last_sequence = greatest(
          daily_member_usage.last_sequence,
          excluded.last_sequence
        ),
        source = excluded.source,
        permission_state = excluded.permission_state
  -- ⚠️ 여기가 0005의 버그였다. 테이블 이름으로 한정하지 않으면 같은 이름의
  -- 파라미터와 구분되지 않는다.
  returning daily_member_usage.cumulative_seconds into v_confirmed;

  v_status := case
    when not v_inserted then 'duplicate'
    when v_confirmed > cumulative_seconds then 'stale'
    else 'recorded'
  end;

  update public.devices
     set last_synced_at = greatest(coalesce(last_synced_at, collected_at), collected_at),
         permission_state = record_usage_snapshot.permission_state
   where id = target_device_id;

  return jsonb_build_object(
    'status', v_status,
    'group_id', v_group.id,
    'period_start', period_start,
    'confirmed_seconds', v_confirmed,
    'accepted_seconds', cumulative_seconds
  );
end;
$$;
