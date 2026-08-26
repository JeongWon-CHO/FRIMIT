-- 한도를 다 쓰면 앱이 잠긴다
--
-- 지금까지 서버는 사용량을 받아 확정만 하고, 잔여는 화면을 그릴 때 따로
-- (`group_daily_usage`) 물어보게 했다. 차단에는 그 순서가 맞지 않는다.
--
-- 잠글지 말지를 판정하는 것은 기기다. iOS의 Monitor extension은 네트워크 없이
-- 백그라운드에서 깨어나 "내가 지금까지 몇 초 썼는지"만 알 수 있고, 공동 풀의
-- 잔여는 서버만 안다. 그래서 기기에는 **잔여 대신 차단선**을 준다 —
-- "네 누적이 N초를 넘으면 잠가라". 그 N을 계산해 주는 곳이 여기다.
--
-- 사용량을 올리는 그 왕복에 얹는다. 따로 물어보게 하면 차단이 화면을 여는
-- 일에 매이고, 앱을 열지 않는 사람에게는 영영 걸리지 않는다.

-- ============================================================================
-- pool_remaining_seconds
-- ============================================================================

/**
 * 그 구간의 공동 풀 잔여. `group_daily_usage`와 같은 규칙으로 센다 —
 * 잔여는 0에서 멈추고 초과분은 여기서 다루지 않는다(plan.md 19~20행).
 *
 * 계산이 `group_daily_usage`와 겹치지만 그쪽은 멤버 목록까지 만들어 붙인다.
 * 스냅샷 한 건마다 부를 값으로는 무겁고, 여기서 필요한 것은 숫자 하나뿐이다.
 */
create or replace function public.pool_remaining_seconds(
  target_group_id uuid,
  period_start timestamptz
) returns int
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_group public.groups;
  v_rule public.group_rules;
  v_time_zone text;
  v_reset_hour int;
  v_period_end timestamptz;
  v_total int;
begin
  select * into v_group from public.groups g where g.id = target_group_id;
  if not found then
    return null;
  end if;

  v_rule := public.effective_rule(v_group.id, period_start);
  v_time_zone := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset_hour := coalesce(v_rule.reset_hour, 6);
  v_period_end := public.frimit_next_period_start(period_start, v_time_zone, v_reset_hour);

  select coalesce(sum(u.cumulative_seconds), 0)::int
    into v_total
    from public.period_member_ids(v_group.id, period_start, v_period_end) as pid
    left join lateral (
      select d.cumulative_seconds
        from public.daily_member_usage d
       where d.group_id = v_group.id
         and d.profile_id = pid
         and d.period_start = pool_remaining_seconds.period_start
    ) u on true;

  -- 한도를 모르면 잔여도 모른다. 0으로 뭉개면 그 그룹의 모두가 즉시 잠긴다 —
  -- `greatest(null - x, 0)`이 0을 돌려주기 때문에 실수하기 딱 좋은 자리다.
  -- 모를 때는 잠그지 않는 쪽으로 넘어간다.
  if v_rule.daily_limit_seconds is null then
    return null;
  end if;

  return greatest(v_rule.daily_limit_seconds - coalesce(v_total, 0), 0);
end;
$$;

comment on function public.pool_remaining_seconds is
  '그 구간의 공동 풀 잔여 초. 기기가 차단선을 계산하는 데 쓴다.';

revoke execute on function public.pool_remaining_seconds(uuid, timestamptz) from public;

-- ============================================================================
-- record_usage_snapshots — 결과에 잔여를 얹는다
-- ============================================================================

/**
 * 달라진 것은 마지막 한 조각뿐이다. 기록에 성공한 건마다 `remaining_seconds`를
 * 붙여 돌려준다.
 *
 * 거절된 건에는 붙이지 않는다. 그런 그룹은 애초에 이 기기가 집계할 대상이
 * 아니고(보관된 그룹, 아직 반영되지 않은 가입), 잔여를 알려 줄 근거도 없다.
 * 기기는 값이 없으면 차단선을 건드리지 않는다 — 모르는 것과 0은 다르다.
 */
create or replace function public.record_usage_snapshots(snapshots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_hint text;
  v_message text;
begin
  if jsonb_typeof(snapshots) <> 'array' then
    raise exception '스냅샷 목록이 배열이 아닙니다.'
      using errcode = 'PT400', hint = 'invalid_payload';
  end if;

  for v_item in select * from jsonb_array_elements(snapshots)
  loop
    begin
      v_one := public.record_usage_snapshot(
        (v_item ->> 'device_id')::uuid,
        (v_item ->> 'group_id')::uuid,
        (v_item ->> 'period_start')::timestamptz,
        (v_item ->> 'cumulative_seconds')::int,
        (v_item ->> 'collected_at')::timestamptz,
        (v_item ->> 'permission_state')::public.permission_state,
        (v_item ->> 'source')::public.usage_source,
        (v_item ->> 'sequence')::bigint
      );

      -- 방금 올린 값까지 반영된 잔여다. 순서가 중요하다 — 올리기 전에 재면
      -- 내가 방금 쓴 시간이 빠진 차단선을 기기에 심게 된다.
      v_one := v_one || jsonb_build_object(
        'remaining_seconds',
        public.pool_remaining_seconds(
          (v_one ->> 'group_id')::uuid,
          (v_one ->> 'period_start')::timestamptz
        )
      );
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint, v_message = message_text;
      v_one := jsonb_build_object(
        'status', 'rejected',
        'group_id', v_item ->> 'group_id',
        'hint', coalesce(v_hint, 'unknown'),
        'message', v_message
      );
    end;

    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return v_results;
end;
$$;

comment on function public.record_usage_snapshots is
  '스냅샷 묶음을 기록하고 건별 공동 풀 잔여를 함께 돌려준다. 한 건이 실패해도 나머지는 기록된다.';

revoke execute on function public.record_usage_snapshots(jsonb) from public;
grant execute on function public.record_usage_snapshots(jsonb) to authenticated;
