-- 누적값은 흐른 시간을 넘을 수 없다
--
-- Android 실기기 1차 측정(2026-08-14)에서 오전 6시부터 11시간 19분 지난 시점에
-- **22시간 38분**짜리 누적값이 올라왔고, 서버는 그것을 그대로 받아 확정값으로
-- 삼았다. 기기 쪽 원인은 `FrimitUsage.foregroundSeconds`의 이벤트 짝짓기였지만
-- (닫힘 이벤트가 두 번 와서 구간 전체가 한 번 더 더해졌다), 여기서 남는 질문은
-- 따로 있다 — **서버는 왜 물리적으로 불가능한 값을 받았는가.**
--
-- 0005의 검증은 `cumulative_seconds between 0 and 90000`뿐이었다. 그 상한은
-- 서머타임으로 25시간이 되는 날을 위한 여유값이지 사용량의 상한이 아니다.
-- plan.md 121행은 "서버 시간을 기준으로 기간과 활성 멤버 여부를 검증한다"고
-- 정해 두었는데, 기간의 **시작**만 검증하고 길이는 보지 않고 있었다.
--
-- 확정값은 최대값으로만 움직이므로(plan.md 123행) 이런 값은 한 번 들어오면
-- 그날 하루를 통째로 오염시킨다. 기기를 고쳐도 서버는 계속 22시간을 들고 있다.
-- 되돌릴 수 없는 값일수록 들어올 때 막아야 한다.
--
--
-- ## 한계값
--
-- `least(now(), period_end) - period_start`. 지난 구간에는 구간 길이 전체가,
-- 진행 중인 구간에는 지금까지 흐른 시간이 상한이 된다. 서머타임으로 23시간이나
-- 25시간이 되는 날도 경계 함수가 계산한 실제 길이를 그대로 쓴다.
--
-- 여기에 15분의 여유를 둔다. 기기 시계가 서버보다 조금 앞서 있으면 정직하게
-- 측정한 값도 한계를 살짝 넘을 수 있기 때문이다. 이 여유는 시계 오차를 위한
-- 것이지 계산 오류를 위한 것이 아니다 — 위 사고는 한계를 11시간 넘겼다.
--
-- 거절돼도 잃는 것은 없다. 누적값은 단조 증가하고 앱은 복귀할 때마다 다시
-- 올리므로, 시계가 맞춰지거나 시간이 조금 더 흐르면 다음 동기화에서 통과한다.

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
  v_elapsed_seconds int;
  v_inserted boolean := false;
  v_previous int;
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

  -- 구간의 시작만이 아니라 길이도 본다. 아직 흐르지 않은 시간을 쓸 수는 없다.
  v_elapsed_seconds := extract(
    epoch from (least(now(), v_period_end) - period_start)
  )::int;

  if cumulative_seconds > v_elapsed_seconds + 900 then
    raise exception '누적 사용 시간이 그 구간에서 흐른 시간보다 깁니다.'
      using errcode = 'PT400', hint = 'cumulative_exceeds_period';
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

  select d.cumulative_seconds into v_previous
    from public.daily_member_usage d
   where d.group_id = v_group.id
     and d.profile_id = v_actor
     and d.period_start = record_usage_snapshot.period_start;

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
  returning daily_member_usage.cumulative_seconds into v_confirmed;

  v_status := case
    when not v_inserted then 'duplicate'
    when v_previous is null then 'recorded'
    when v_confirmed > v_previous then 'recorded'
    else 'stale'
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
    'accepted_seconds', cumulative_seconds,
    'gained_seconds', v_confirmed - coalesce(v_previous, 0)
  );
end;
$$;
