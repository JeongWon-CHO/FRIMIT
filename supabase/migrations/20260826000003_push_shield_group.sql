-- 한도 소진 알림에 잠글 그룹을 실어 보낸다
--
-- 앞선 마이그레이션으로 기기가 스스로 잠그게 됐지만, 그 판정은 **내 사용량이
-- 오를 때만** 일어난다. 공동 풀은 남이 대신 태울 수 있고 그때 내 누적은 1초도
-- 늘지 않는다. 남은 구멍이 그것이다 — 내가 그 앱을 보고 있는 동안 잔여가 0이
-- 됐는데, 다음 동기화까지 아무 일도 일어나지 않는다.
--
-- 새 통로를 파지 않는다. "오늘 몫을 다 썼어요" 알림은 이미 그 그룹의 전원에게
-- 나가고 있다. 거기에 그룹 id만 실어 보내면, 알림을 받은 기기가 화면에 띄우기
-- 전에 그 자리에서 잠근다(`FrimitNotificationService`).
--
-- 바뀌는 것은 `claim_push_batch`가 돌려주는 항목에 `group_id`가 하나 붙는 것뿐이다.
-- 누구에게 보낼지도, 몇 번 보낼지도 그대로다.

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
       and e.kind in ('pool_threshold', 'pool_over')
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
    returning e.id, e.group_id, e.kind, e.payload
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', c.id,
           'kind', c.kind,
           'payload', c.payload,
           'group_name', g.name,
           -- 잠글 그룹. 발송기가 한도 소진 사건에만 이 값을 알림에 실어 보낸다.
           -- 75%·90%에는 싣지 않는다 — 아직 잠글 때가 아니다.
           'group_id', c.group_id,
           -- 계정당 활성 기기는 하나뿐이다(0001). 그래도 distinct를 두는 것은
           -- 같은 사람이 두 그룹에 있어도 사건은 그룹당 하나이기 때문이다.
           'tokens', (
             select coalesce(jsonb_agg(distinct d.expo_push_token), '[]'::jsonb)
               from public.active_member_ids(c.group_id) as pid
               join public.devices d
                 on d.profile_id = pid
                and d.is_active
                and d.expo_push_token is not null
           )
         )), '[]'::jsonb)
    into v_result
    from claimed c
    join public.groups g on g.id = c.group_id;

  return v_result;
end;
$$;

comment on function public.claim_push_batch is
  '발송할 사건을 집고 발송됨으로 표시한다. 한도 소진 사건에는 잠글 그룹 id가 함께 나간다. 예약 작업 전용(service_role).';

-- create or replace가 기존 권한을 지우지는 않지만, 이 함수가 어디서도 열려서는
-- 안 된다는 사실을 옮겨 온 정의 옆에 함께 남긴다.
revoke execute on function public.claim_push_batch(int) from public;
