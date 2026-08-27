-- 한 번에 생긴 한도 알림은 하나만 보낸다 (그리고 0011의 갱신을 되살린다)
--
-- ## 되살리는 것부터
--
-- 바로 앞 마이그레이션(0022)은 `claim_push_batch`에 `group_id` 한 줄을 더하려고
-- 함수를 통째로 다시 썼는데, **0011(social)이 아니라 0009(push)의 본문을 바탕으로
-- 썼다.** 그 사이에 0011이 더해 둔 셋이 조용히 사라졌다.
--
--   - 콕 찌르기(`nudge`)가 발송 대상에서 빠졌다
--   - 받는 사람이 정해진 사건(`target_id`)이 그룹 전체로 나갔다
--   - 음소거(`notifications_muted`)가 무시됐다
--
-- `create or replace`는 이런 종류의 실수를 아무 말 없이 통과시킨다. 여기서는
-- 0011의 본문을 바탕으로 다시 쓴다.
--
-- ## 그리고 접는 것
--
-- 한도 트리거는 75·90·100을 낮은 것부터 훑고, 한 번의 갱신이 세 단계를 한꺼번에
-- 넘기면 세 줄을 다 남긴다(0010). **활동 탭에서는 그게 맞다** — 지나간 단계도
-- 그날의 기록이다. 그런데 발송기가 그걸 그대로 집어서, 실기기 검증에서 이런 일이
-- 벌어졌다.
--
--   우리 시간의 75%를 썼어요
--   우리 시간의 90%를 썼어요
--   오늘 몫을 다 썼어요
--   8분 넘겼어요
--
-- 네 줄이 같은 초에 잠금 화면에 쌓인다. plan.md 25행이 약속한 것은 "단계마다
-- 하루 한 번"이지 "한 번에 네 번"이 아니고, 온보딩에서 한 약속("하루에 몇 번이면
-- 충분해요")은 이걸로 그냥 거짓말이 된다.
--
-- 같은 묶음 안에서 같은 그룹·같은 날짜의 한도 사건은 **가장 앞선 것 하나만**
-- 내보낸다. 나머지도 `pushed_at`은 찍혀서 다음 실행이 다시 집지 않는다 —
-- 활동 탭에는 그대로 남고, 알림으로만 나가지 않는다.
--
-- 시각이 다르면 접히지 않는다. 오후 2시의 75%와 저녁 8시의 100%는 다른 묶음이라
-- 각각 나간다. 접히는 것은 **한 순간에 함께 태어난 것들**뿐이다.

create or replace function public.claim_push_batch(max_events int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with picked as (
    select e.id
      from public.activity_events e
     where e.pushed_at is null
       and e.kind in ('pool_threshold', 'pool_over', 'nudge')
       and e.created_at > now() - interval '1 hour'
     order by e.created_at
     limit greatest(1, least(coalesce(max_events, 50), 100))
       for update skip locked
  ),
  claimed as (
    update public.activity_events e
       set pushed_at = now()
      from picked p
     where e.id = p.id
    returning e.id, e.group_id, e.date_key, e.kind, e.payload, e.actor_id, e.target_id
  ),
  ranked as (
    select
      c.*,
      /*
       * 콕 찌르기는 접지 않는다. 세 사람이 동시에 찔렀으면 세 번 오는 것이 맞다 —
       * 보낸 사람이 각자 다르고, 상한은 쿨다운이 따로 지킨다(0011).
       *
       * 한도 사건만 접는다. 순서는 100% → 초과 → 90% → 75%다. 초과가 100%보다
       * 뒤인 이유: 둘이 함께 나는 것은 오늘 처음 한도를 넘긴 순간이고, 그때
       * 먼저 읽혀야 하는 말은 "몇 분 넘겼다"가 아니라 "다 썼다"이다.
       */
      c.kind = 'nudge'
        or row_number() over (
             partition by c.group_id, c.date_key
             order by
               (c.kind = 'nudge'),
               case c.kind
                 when 'pool_over' then 95
                 else coalesce((c.payload ->> 'threshold')::int, 0)
               end desc
           ) = 1 as keep
      from claimed c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', c.id,
           'kind', c.kind,
           'payload', c.payload,
           'group_name', g.name,
           -- 잠글 그룹. 발송기가 한도 소진 사건에만 이 값을 알림에 실어 보낸다.
           'group_id', c.group_id,
           'tokens', (
             select coalesce(jsonb_agg(distinct d.expo_push_token), '[]'::jsonb)
               from public.group_memberships m
               join public.devices d
                 on d.profile_id = m.profile_id
                and d.is_active
                and d.expo_push_token is not null
              where m.group_id = c.group_id
                -- 받는 사람이 정해진 사건은 그 사람에게만.
                and (c.target_id is null or m.profile_id = c.target_id)
                -- 자기가 한 일을 자기에게 알리지 않는다.
                and (c.actor_id is null or m.profile_id <> c.actor_id)
                -- 음소거는 콕 찌르기에만 걸린다. 한도 알림은 그룹의 사정이라
                -- 개인이 끄는 대상이 아니다(plan.md 58행).
                and (c.kind <> 'nudge' or not m.notifications_muted)
                -- active_member_ids와 같은 조건이다.
                and m.effective_from is not null
                and m.effective_from <= now()
                and (m.effective_until is null or m.effective_until > now())
           )
         )), '[]'::jsonb)
    into v_result
    from ranked c
    join public.groups g on g.id = c.group_id
   where c.keep;

  return v_result;
end;
$$;

comment on function public.claim_push_batch is
  '발송할 사건을 집고 발송됨으로 표시한다. 같은 묶음의 한도 사건은 가장 앞선 하나만 나가고, 한도 소진 사건에는 잠글 그룹 id가 함께 실린다. 예약 작업 전용(service_role).';

revoke execute on function public.claim_push_batch(int) from public;
