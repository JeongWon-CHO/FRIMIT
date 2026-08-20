-- 반응과 콕 찌르기 (reactions / nudges)
--
-- plan.md 56~58행이 정한 것 셋이다.
--   · 활동 이벤트에 정해진 이모지 세트로 반응할 수 있다
--   · 콕 찌르기는 같은 발신자→수신자 기준 30분 쿨다운, 상대별 하루 10회
--   · 그룹별로 반응·콕 찌르기 푸시를 음소거할 수 있다
--
--
-- ## 반응은 사건이 아니라 사건에 붙는 것이다
--
-- plan.md 78행은 활동 탭이 보여줄 것에 '반응'을 넣었지만, 디자인은 반응을 **줄로
-- 세우지 않고 사건 아래 칩으로** 붙인다(COMPONENT_SPEC §11). 후자를 따른다 —
-- 반응마다 한 줄이 생기면 세 사람이 👏 한 번씩 누른 순간 피드가 반응으로 덮인다.
-- 그건 plan.md가 배제한 '댓글'과 사실상 같은 물건이 된다.
--
-- 그래서 반응은 푸시도 보내지 않는다. 온보딩에서 "하루에 몇 번이면 충분해요"라고
-- 약속한 것과 이모지마다 울리는 알림은 같이 갈 수 없다. 음소거 스위치는 콕
-- 찌르기에만 걸리고, 나중에 반응 푸시를 넣기로 하면 그 스위치를 그대로 쓰면 된다.
--
--
-- ## 한 사람당 한 반응
--
-- 슬랙처럼 여러 이모지를 겹쳐 달 수도 있지만, 그러면 칩 줄이 길어지고 "누가 뭘
-- 눌렀나"를 세는 화면이 필요해진다. 사건 하나에 사람 하나가 이모지 하나를 고르는
-- 것으로 충분하고, 다시 누르면 바뀌고 같은 걸 또 누르면 지워진다.
--
--
-- ## 콕 찌르기의 상한은 서버에 있다
--
-- 30분 쿨다운과 하루 10회는 화면에서 비활성화하는 것으로는 지킬 수 없다. 두
-- 기기에서 동시에 누르거나 API를 직접 부르면 그만이다. `send_nudge`가 그룹 행을
-- 잡고 세므로 그 사이에 끼어들 수 없다.
--
-- 하루의 기준은 자정이 아니라 그룹의 오전 6시다. 이 제품의 모든 '하루'가 그렇다.
--
--
-- ## 받는 사람이 정해진 사건
--
-- 한도 알림은 그룹 전체에 가지만 콕 찌르기는 한 사람에게만 간다. 사건에
-- `target_id`를 두어 그 차이를 담는다 — null이면 그룹 전체다. 발송기는 이 값
-- 하나만 보면 되고, 앞으로 개인에게 가는 사건이 늘어도 발송기는 그대로다.

-- ============================================================================
-- 사건의 수신자와 음소거
-- ============================================================================

alter table public.activity_events
  add column target_id uuid references public.profiles(id) on delete cascade;

comment on column public.activity_events.target_id is
  '이 사건이 향하는 사람. null이면 그룹 전체를 향한다(한도 도달 등).';

alter table public.group_memberships
  add column notifications_muted boolean not null default false;

comment on column public.group_memberships.notifications_muted is
  '이 그룹의 콕 찌르기 푸시를 끈다. 한도 알림은 음소거 대상이 아니다(plan.md 58행).';

-- 준비 상태와 같은 취급이다. 본인 행의 본인 설정이라 RPC를 거칠 이유가 없고,
-- 0002의 "본인 멤버십 수정" 정책이 남의 행을 막는다.
grant update (is_ready, notifications_muted) on table public.group_memberships to authenticated;

-- ============================================================================
-- reactions
-- ============================================================================

create table public.reactions (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.activity_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- 정해진 세트만(plan.md 56행). 자유 입력을 열면 신고·검수 부담이 따라온다.
  emoji text not null
    constraint reaction_emoji_allowed check (emoji in ('👏', '🔥', '😂', '😮', '👀')),

  created_at timestamptz not null default now(),

  constraint one_reaction_per_person unique (event_id, profile_id)
);

comment on table public.reactions is
  '사건에 붙는 반응. 사람당 하나이며, 다시 누르면 바뀌고 같은 것을 또 누르면 지워진다.';

create index reactions_event_idx on public.reactions (event_id);

-- ============================================================================
-- nudges
-- ============================================================================

create table public.nudges (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint no_self_nudge check (sender_id <> recipient_id)
);

comment on table public.nudges is
  '콕 찌르기 기록. 30분 쿨다운과 하루 10회를 세는 근거이므로 지우지 않는다.';

-- 쿨다운과 일일 한도는 항상 (보낸이, 받는이, 최근순)으로 센다.
create index nudges_pair_idx on public.nudges (sender_id, recipient_id, created_at desc);

/** 콕 찌르기 규칙(plan.md 57행). 값을 바꾸려면 여기 하나만 고치면 된다. */
create or replace function public.nudge_cooldown() returns interval
language sql immutable as $$ select interval '30 minutes' $$;

create or replace function public.nudge_daily_limit() returns int
language sql immutable as $$ select 10 $$;

-- ============================================================================
-- 헬퍼
-- ============================================================================

/**
 * 이 사건을 볼 수 있는가. reactions의 조회 정책이 쓴다.
 *
 * 0008의 `can_see_goal`과 같은 이유로 security definer이고, 같은 이유로 PUBLIC에서
 * 회수하지 않는다 — 정책은 조회하는 롤의 권한으로 평가된다.
 */
create or replace function public.can_see_event(target_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.activity_events e
     where e.id = target_event_id
       and public.is_group_member(e.group_id)
  );
$$;

-- ============================================================================
-- react_to_event
-- ============================================================================

/**
 * 사건에 반응한다. 같은 이모지를 다시 누르면 지워진다(토글).
 *
 * 반응은 사건을 만들지 않는다. 이 파일 머리말의 이유이고, 그래서 여기서 하는 일은
 * 행 하나를 넣거나 바꾸거나 지우는 것뿐이다.
 */
create or replace function public.react_to_event(
  target_event_id uuid,
  reaction_emoji text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if not public.can_see_event(target_event_id) then
    raise exception '볼 수 없는 활동입니다.'
      using errcode = 'PT404', hint = 'event_not_visible';
  end if;

  select r.emoji into v_existing
    from public.reactions r
   where r.event_id = target_event_id
     and r.profile_id = v_actor;

  -- 같은 것을 또 눌렀다 = 취소.
  if v_existing = reaction_emoji then
    delete from public.reactions
     where event_id = target_event_id and profile_id = v_actor;

    return jsonb_build_object('emoji', null);
  end if;

  insert into public.reactions (event_id, profile_id, emoji)
  values (target_event_id, v_actor, reaction_emoji)
  on conflict (event_id, profile_id) do update
    set emoji = excluded.emoji,
        created_at = now();

  return jsonb_build_object('emoji', reaction_emoji);
exception
  when check_violation then
    raise exception '쓸 수 없는 이모지입니다.'
      using errcode = 'PT400', hint = 'emoji_not_allowed';
end;
$$;

-- ============================================================================
-- send_nudge
-- ============================================================================

/**
 * 콕 찌른다.
 *
 * 상한을 서버에서 세는 것이 이 함수의 전부다. 화면에서 버튼을 비활성화하는 것으로는
 * 지킬 수 없다 — 기기 두 대에서 동시에 누르거나 API를 직접 부르면 그만이다.
 * 그룹 행을 잡고 세므로 그 사이에 끼어들 수 없다.
 *
 * 사건도 여기서 함께 만든다. 트리거로 뺄 수도 있지만, 닉네임을 그 시점의 값으로
 * 박아 두려면(이름은 바뀌고 피드는 그때의 기록이다) 어차피 여기서 읽어야 한다.
 */
create or replace function public.send_nudge(
  target_group_id uuid,
  target_profile_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_period_start timestamptz;
  v_recent timestamptz;
  v_today int;
  v_sender text;
  v_recipient text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if v_actor = target_profile_id then
    raise exception '자기 자신은 찌를 수 없습니다.'
      using errcode = 'PT400', hint = 'self_nudge';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  if not public.is_group_member(v_group.id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  -- 받는 사람도 지금 이 그룹에 잡혀 있어야 한다. 어제 나간 사람을 계속 찌를 수는 없다.
  if not exists (
    select 1 from public.active_member_ids(v_group.id) as pid
     where pid = target_profile_id
  ) then
    raise exception '그룹에 없는 사람입니다.'
      using errcode = 'PT404', hint = 'recipient_not_member';
  end if;

  select max(n.created_at) into v_recent
    from public.nudges n
   where n.sender_id = v_actor
     and n.recipient_id = target_profile_id;

  if v_recent is not null and v_recent > now() - public.nudge_cooldown() then
    raise exception '방금 찔렀어요. 조금 뒤에 다시 시도해 주세요.'
      using errcode = 'PT429', hint = 'nudge_cooldown';
  end if;

  v_rule := public.effective_rule(v_group.id, now());
  v_period_start := public.frimit_period_start(
    now(),
    coalesce(v_rule.time_zone, v_group.time_zone),
    coalesce(v_rule.reset_hour, 6)
  );

  select count(*) into v_today
    from public.nudges n
   where n.sender_id = v_actor
     and n.recipient_id = target_profile_id
     and n.created_at >= v_period_start;

  if v_today >= public.nudge_daily_limit() then
    raise exception '오늘은 이 친구를 충분히 찔렀어요.'
      using errcode = 'PT429', hint = 'nudge_daily_limit';
  end if;

  insert into public.nudges (group_id, sender_id, recipient_id)
  values (v_group.id, v_actor, target_profile_id);

  select nickname into v_sender from public.profiles where id = v_actor;
  select nickname into v_recipient from public.profiles where id = target_profile_id;

  -- `log_activity`를 쓰지 않고 직접 넣는다. 그 함수는 그룹 전체를 향하는 사건을
  -- 위한 것이라 target을 받지 않고, 넣은 뒤 되찾아 표시하려면 "방금 그 줄"을
  -- 조건으로 찾아야 한다 — 같은 사람이 1초 안에 둘을 찌르면 엉뚱한 줄에 붙는다.
  insert into public.activity_events (group_id, actor_id, target_id, kind, payload)
  values (
    v_group.id,
    v_actor,
    target_profile_id,
    'nudge',
    jsonb_build_object(
      'sender_nickname', coalesce(v_sender, '친구'),
      'recipient_nickname', coalesce(v_recipient, '친구'),
      'recipient_id', target_profile_id
    )
  );

  return jsonb_build_object(
    'remaining_today', public.nudge_daily_limit() - v_today - 1,
    'next_allowed_at', now() + public.nudge_cooldown()
  );
end;
$$;

-- ============================================================================
-- 발송 대상 (claim_push_batch 갱신)
--
-- 0009는 사건이 언제나 그룹 전체를 향한다고 보고 `active_member_ids`를 그대로
-- 썼다. 콕 찌르기가 생기면서 두 가지가 달라진다 — 받는 사람이 정해진 사건이
-- 있고(target_id), 음소거가 걸린다.
--
-- 멤버 판정을 `active_member_ids`로 하지 않고 풀어 쓴 것은 음소거 값을 읽어야
-- 하기 때문이다. 조건은 그 함수와 정확히 같다(0002).
-- ============================================================================

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
    returning e.id, e.group_id, e.kind, e.payload, e.actor_id, e.target_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', c.id,
           'kind', c.kind,
           'payload', c.payload,
           'group_name', g.name,
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
    from claimed c
    join public.groups g on g.id = c.group_id;

  return v_result;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.reactions enable row level security;
alter table public.nudges enable row level security;

create policy "멤버는 반응 조회"
  on public.reactions for select
  using (public.can_see_event(event_id));

-- 콕 찌르기 기록 자체는 상한을 세는 근거일 뿐이고, 사람에게 보여야 하는 것은
-- 활동 내역의 사건이다. 본인이 주고받은 것만 열어 둔다.
create policy "본인이 주고받은 콕 찌르기 조회"
  on public.nudges for select
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

grant select on table public.reactions to authenticated;
grant select on table public.nudges to authenticated;

revoke execute on function public.nudge_cooldown() from public;
revoke execute on function public.nudge_daily_limit() from public;

revoke execute on function public.react_to_event(uuid, text) from public;
grant execute on function public.react_to_event(uuid, text) to authenticated;

revoke execute on function public.send_nudge(uuid, uuid) from public;
grant execute on function public.send_nudge(uuid, uuid) to authenticated;
