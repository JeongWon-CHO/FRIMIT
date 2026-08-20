-- 푸시 발송 대상 뽑기 (activity_events.pushed_at + claim_push_batch)
--
-- plan.md가 자동 푸시로 정한 것은 **한도 단계 하나뿐이다**(25행: 75·90·100% 도달
-- 시 그룹당 하루 한 번). 목표 기록이나 가입까지 보내면 온보딩에서 약속한
-- "하루에 몇 번이면 충분해요"가 거짓말이 된다. 나머지 사건은 활동 탭에 남는다.
--
-- 반응·콕 찌르기가 생기면 그때 대상이 늘고, 음소거 설정도 그때 필요해진다
-- (plan.md 58행은 음소거 대상을 그 둘로 한정한다). 지금 만들면 아무 데도 걸리지
-- 않는 스위치가 된다.
--
--
-- ## 중복 방지는 이미 되어 있다
--
-- "그룹당 하루 한 번"은 0008의 `dedupe_key`가 사건 단계에서 이미 보장한다.
-- 그러므로 발송 쪽에서 다시 셀 필요가 없다 — **사건 하나에 발송 한 번**이면 된다.
-- `pushed_at`이 그 표시다.
--
--
-- ## 왜 claim인가
--
-- 발송기는 밖에서(Edge Function) 주기적으로 부른다. 실행이 겹치거나 앞 실행이
-- 느릴 수 있으므로, 뽑는 것과 표시하는 것이 한 문장 안에서 원자적으로 일어나야
-- 한다. `for update skip locked`가 그 역할을 한다 — 두 실행이 같은 사건을 집지
-- 않고, 하나가 죽어도 잠금이 풀리면 다음 실행이 가져간다.
--
-- 발송에 실패하면 `release_push_batch`로 표시를 되돌린다. 되돌리지 않으면 Expo가
-- 잠깐 불안정했다는 이유로 그날의 75% 알림이 조용히 사라진다.
--
--
-- ## 문장은 여기서 만들지 않는다
--
-- 0008과 같은 이유이고, 하나가 더 있다. 푸시는 제목과 본문으로 나뉘고 길이 제한이
-- 있어서 피드의 문장과 애초에 다른 글이다. 재료만 넘기고 조판은 Edge Function이
-- 한다.

alter table public.activity_events
  add column pushed_at timestamptz;

comment on column public.activity_events.pushed_at is
  '푸시를 보낸 시각. 발송 대상이 아닌 종류는 영원히 null로 남는다.';

-- 보내야 할 것만 빠르게 찾는다. 대부분의 행은 발송 대상이 아니므로 부분 인덱스다.
create index activity_events_pending_push_idx
  on public.activity_events (created_at)
  where pushed_at is null;

/**
 * 보낼 사건과 받을 토큰을 한 번에 집어 온다. 집는 순간 발송됨으로 표시한다.
 *
 * 받는 사람은 그 그룹의 **지금 활성 멤버 전원**이다. 한도 사건에는 주인이 없으므로
 * (0008) 제외할 사람도 없다 — 많이 쓴 사람만 빼거나 지목하는 순간 이 제품의 톤이
 * 무너진다.
 *
 * 한 시간이 지난 사건은 보내지 않는다. 발송기가 하루 멈췄다가 되살아났을 때
 * 어제의 한도 알림이 한꺼번에 쏟아지는 것보다, 지나간 일은 조용히 지나가는 편이
 * 낫다. 활동 탭에는 그대로 남아 있다.
 */
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
  '발송할 사건을 집고 발송됨으로 표시한다. 예약 작업 전용(service_role).';

/** 발송에 실패한 사건을 다시 대기로 돌린다. 다음 실행이 가져간다. */
create or replace function public.release_push_batch(event_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.activity_events
     set pushed_at = null
   where id = any(event_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * 더 이상 유효하지 않은 토큰을 지운다.
 *
 * Expo가 `DeviceNotRegistered`로 돌려주는 경우다 — 앱을 지웠거나 알림을 껐다.
 * 그대로 두면 매번 같은 실패를 보내게 되고, 기기 행 자체는 사용량 집계에
 * 필요하므로 지우면 안 된다. 토큰만 비운다.
 */
create or replace function public.forget_push_token(bad_token text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.devices
     set expo_push_token = null
   where expo_push_token = bad_token;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- 권한 (GRANT)
--
-- 셋 다 발송기 전용이다. authenticated에게 열면 남의 토큰을 지우거나 발송 표시를
-- 되돌릴 수 있다. service_role은 0003의 default privileges로 이미 실행할 수 있다.
-- ============================================================================

revoke execute on function public.claim_push_batch(int) from public;
revoke execute on function public.release_push_batch(uuid[]) from public;
revoke execute on function public.forget_push_token(text) from public;
