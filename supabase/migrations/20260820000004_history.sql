-- 최근 며칠의 공동 풀 (group_recent_days)
--
-- plan.md 82행의 "최근 7일 기록"과 MY 탭의 두 숫자(주간 평균·한도 미만 연속
-- 일수)가 전부 이 한 함수에서 나온다. 화면 세 곳이 같은 표를 세 가지로 세는 것을
-- 막으려는 것이다 — 한 곳에서 나온 같은 숫자여야 사용자가 화면을 옮겨 다니며
-- 셈을 맞춰 볼 수 있다.
--
--
-- ## 날짜는 하루씩 빼면 안 된다
--
-- Frimit의 하루는 오전 6시에 시작하므로, 지난 구간의 시작은 "지금 구간 − 24시간"이
-- 아니라 "그룹 시간대의 벽시계로 하루 전 오전 6시"다. 서머타임이 있는 시간대에서
-- 24시간씩 빼면 하루가 5시나 7시에 시작한 것으로 잡히고, 그 날의 합계가 이웃
-- 구간으로 새어 든다. 한국에는 서머타임이 없지만 그룹 시간대는 값으로 정해지고
-- 여행하는 사용자도 있다.
--
--
-- ## 한도는 그날의 한도다
--
-- 공동 한도는 전원 동의로 바뀔 수 있고(0005), 규칙은 덮어쓰지 않고 버전으로
-- 쌓인다. 그래서 지난 화요일 막대의 기준선은 지금 한도가 아니라 **그때 유효했던
-- 한도**여야 한다. `effective_rule`을 날짜마다 부르는 이유다.
--
--
-- ## 오늘도 들어 있다
--
-- 마지막 칸은 아직 끝나지 않은 하루다. 빼면 "오늘 우리가 어디쯤인지"를 지난
-- 기록과 나란히 볼 수 없고, 그게 이 화면이 답해야 하는 질문이다. 그 칸이 진행
-- 중이라는 사실은 화면이 안다(마지막 칸).

create or replace function public.group_recent_days(
  target_group_id uuid,
  day_count int default 7
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_tz text;
  v_reset int;
  v_today timestamptz;
  -- 확정 집계는 90일 보관이므로 그보다 길게 물어도 빈 칸만 돌아온다.
  v_days int := greatest(1, least(coalesce(day_count, 7), 30));
  v_result jsonb;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  -- security definer라 RLS를 우회한다. 멤버 여부를 직접 확인해야 한다.
  if not public.is_group_member(target_group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  select * into v_group from public.groups g where g.id = target_group_id;

  v_rule := public.effective_rule(v_group.id, now());
  v_tz := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset := coalesce(v_rule.reset_hour, 6);
  v_today := public.frimit_period_start(now(), v_tz, v_reset);

  with periods as (
    -- 벽시계로 하루씩 뺀 뒤 다시 순간으로 돌린다. 24시간씩 빼는 것과 다르다.
    select ((v_today at time zone v_tz) - make_interval(days => back)) at time zone v_tz
             as period_start
      from generate_series(0, v_days - 1) as back
  ),
  daily as (
    select
        p.period_start,
        public.frimit_date_key(p.period_start, v_tz, v_reset) as date_key,
        -- 그날 유효했던 한도. 지금 한도가 아니다.
        coalesce(r.daily_limit_seconds, 0) as limit_seconds,
        coalesce(u.total, 0) as total_seconds,
        coalesce(u.mine, 0) as my_seconds
      from periods p
      left join lateral public.effective_rule(target_group_id, p.period_start) r on true
      left join lateral (
        select
            sum(d.cumulative_seconds)::int as total,
            coalesce(
              sum(d.cumulative_seconds) filter (where d.profile_id = v_actor),
              0
            )::int as mine
          from public.period_member_ids(
                 target_group_id,
                 p.period_start,
                 public.frimit_next_period_start(p.period_start, v_tz, v_reset)
               ) as pid
          join public.daily_member_usage d
            on d.group_id = target_group_id
           and d.profile_id = pid
           and d.period_start = p.period_start
      ) u on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date_key', date_key,
           'period_start', period_start,
           'total_seconds', total_seconds,
           'limit_seconds', limit_seconds,
           'my_seconds', my_seconds
         ) order by period_start), '[]'::jsonb)
    into v_result
    from daily;

  return v_result;
end;
$$;

comment on function public.group_recent_days is
  '최근 며칠의 공동 풀. 한도는 그날 유효했던 값이고 마지막 칸은 진행 중인 오늘이다.';

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

revoke execute on function public.group_recent_days(uuid, int) from public;
grant execute on function public.group_recent_days(uuid, int) to authenticated;
