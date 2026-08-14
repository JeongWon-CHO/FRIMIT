-- 스냅샷 처리 결과를 정확히 말하게 한다
--
-- 0005의 status 판정에는 구멍이 있었다. `stale`을 "확정값이 새 값보다 크다"로만
-- 판단했기 때문에, **같은 값을 다시 올린 경우**가 `recorded`로 찍혔다.
-- 확정값은 한 톨도 움직이지 않았는데 화면에는 "기록 1"이라고 나온다.
--
-- 기기의 sequence는 스냅샷을 읽을 때마다 증가하므로, 앱을 껐다 켜기만 해도
-- 멱등 키가 매번 달라진다. 즉 `duplicate`는 같은 요청을 재전송했을 때만 나오고,
-- 평소의 재동기화는 전부 이 경로를 탄다. 가장 흔한 경우가 가장 부정확하게
-- 보고되고 있었던 셈이다.
--
-- 갱신 전 확정값을 먼저 읽어 두고 비교한다.
--
--   recorded  — 확정값이 올랐다(첫 기록 포함)
--   stale     — 받아서 원본으로는 남겼지만 확정값은 그대로다(같거나 낮은 값)
--   duplicate — 같은 (device, group, period, sequence)가 이미 있었다

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

  -- 갱신 **전** 확정값. 이 값이 있어야 "올랐는지"를 말할 수 있다.
  -- 위에서 그룹 행을 잠갔으므로 같은 그룹의 다른 요청과 경합하지 않는다.
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
    -- 확정값이 얼마나 올랐는지. 0이면 이번 동기화는 아무것도 바꾸지 않았다.
    'gained_seconds', v_confirmed - coalesce(v_previous, 0)
  );
end;
$$;
