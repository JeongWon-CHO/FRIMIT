-- 끝난 목표를 7일 동안 남긴다
--
-- `live_goal`은 `ends_at > now()`라, 30일을 함께 달린 목표는 끝나는 순간
-- 목표 탭이 "아직 목표가 없어요"로 돌아간다. 결과를 볼 자리가 앱 어디에도 없다.
-- 활동 내역에도 안 남는다 — 시간이 흘러 끝나는 것은 행 변경이 아니라서 트리거가
-- 걸릴 자리가 없다.
--
-- 읽기 함수 하나만 고친다. `current_goal`이 살아 있는 목표가 없을 때 최근 7일 안에
-- 끝난 목표를 대신 주고, 화면은 그 카드를 "끝난 목표"로 그린다. 예약 작업도 새
-- 테이블도 필요 없다.
--
-- 7일이라는 숫자에 규칙은 없다. 다음 목표를 걸면 그전에 사라지고(살아 있는 목표가
-- 이기므로), 안 걸어도 한 주가 지나면 물러난다.

create or replace function public.current_goal(target_group_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_goal public.goals;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if not public.is_group_member(target_group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  v_goal := public.live_goal(target_group_id);

  -- 살아 있는 목표가 없으면 최근에 끝난 것을 대신 준다. 30일을 함께 달린 결과가
  -- 끝나는 순간 화면에서 증발하면, 그 30일을 확인할 자리가 앱 어디에도 없다.
  --
  -- 새 목표를 거는 길은 건드리지 않는다. `create_goal`은 여전히 `live_goal`로
  -- 검사하므로, 결과 카드가 떠 있는 동안에도 새 목표를 걸 수 있다 — 그리고 걸면
  -- 그것이 살아 있는 목표가 되어 카드는 저절로 교체된다.
  --
  -- 그만둔 목표는 여기 오지 않는다. 취소는 "지금까지의 기록이 함께 사라져요"라고
  -- 말하고 지운 것이라, 결과랄 것이 없다.
  if v_goal.id is null then
    select g.* into v_goal
      from public.goals g
     where g.group_id = target_group_id
       and g.cancelled_at is null
       and g.ends_at <= now()
       and g.ends_at > now() - interval '7 days'
     order by g.ends_at desc
     limit 1;
  end if;

  if v_goal.id is null then return null; end if;

  return public.goal_snapshot(v_goal.id, v_actor);
end;
$$;
