-- 그룹 수명주기 RPC: 생성, 가입, 시작, 탈퇴, 관리자 이전
--
-- 0002는 그룹을 **RPC로만** 만들 수 있게 설계해 두고 그 RPC를 만들지 않았다.
-- groups/group_memberships에는 insert 정책도 insert 권한도 없고 invite_code는
-- default 없는 not null이라, 지금 이 스키마로는 그룹을 만들 방법이 아예 없다.
-- 이 파일이 그 구멍을 메운다.
--
-- 여기서 정하는 규칙은 전부 "클라이언트가 우회할 수 없어야 하는 것"들이다.
-- 최대 5그룹, 정원 8명, 준비 2명 이상에서만 시작, 관리자는 넘기고 나가기.
-- 그래서 검사는 전부 security definer 함수 안에서 행 잠금을 잡고 한다.
--
--
-- ## 좌석(seat)
--
-- 상한을 세는 단위는 **좌석**이다. `effective_until is null or effective_until > now()`,
-- 즉 `is_group_member`가 참이 되는 조건(0002)과 정확히 같은 정의를 쓴다.
--
-- 활성 멤버(`active_member_ids`) 기준으로 세면 안 된다. 그러면 draft 멤버와
-- 내일 오전 6시에 반영될 예약 가입자가 빠져서, 오후에 여덟 명이 예약 가입하면
-- 내일 열여섯 명이 된다. 반대로 멤버십 행 수로 세면 반년 전에 나간 사람이
-- 자리를 영구히 점유한다. 좌석은 그 사이에서 "지금 이 그룹에 얽혀 있는 사람"을
-- 정확히 센다 — 탈퇴를 예약한 사람도 오전 6시까지는 오늘의 공동 풀을 쓰므로
-- 자리를 차지한 것이 맞다.
--
-- 사용자당 5그룹에는 draft 그룹도 포함한다. 빼면 draft를 스무 개 만들어 두고
-- 순서대로 시작할 수 있는데, 그 시점엔 이미 멤버가 들어와 있어 되돌릴 수 없다.
-- 상한은 되돌릴 수 있는 지점에서 걸어야 한다.
--
--
-- ## 반영 시각
--
-- | 상황                | effective_from            | effective_until           |
-- |---------------------|---------------------------|---------------------------|
-- | draft 그룹 가입     | null                      | —                         |
-- | 그룹 시작           | 일괄로 started_at         | —                         |
-- | active 그룹 가입    | 다음 오전 6시             | —                         |
-- | draft에서 탈퇴      | —                         | now()                     |
-- | active에서 탈퇴     | —                         | 다음 오전 6시             |
--
-- draft 가입자가 null인 것은 0002의 컬럼 주석이 이미 정한 바다("그룹 시작 전
-- 가입자는 그룹 시작 시각"). 가입 시점에는 started_at을 모르므로 넣을 값이 없고,
-- `active_member_ids`가 `effective_from is not null`을 요구하는 덕에 draft 그룹은
-- 아무 분기 없이 "활성 멤버 0명"이 된다.
--
--
-- ## 잠금
--
-- 순서는 **profiles → groups → group_memberships**. 이 순서를 지키면 데드락이 없다.
--
-- `for update`가 아니라 `for no key update`를 쓴다. group_memberships가 groups를
-- 참조하므로 멤버십 insert마다 부모 행에 FOR KEY SHARE가 걸리는데, FOR UPDATE는
-- 그것과 충돌해 무관한 쓰기까지 줄 세운다. FOR NO KEY UPDATE는 FOR KEY SHARE와
-- 공존하면서 자기들끼리는 충돌하므로 RPC끼리만 직렬화된다. 우리는 기본키를
-- 바꾸지 않으니 이게 정확한 수준이다.
--
--
-- ## 오류
--
-- 메시지는 그대로 사용자에게 보여줄 수 있는 한국어로 쓰되, 클라이언트가 문자열로
-- 분기하지 않도록 `hint`에 ASCII 슬러그를 싣는다. PostgREST가 {message, hint}를
-- 그대로 내려주므로 화면 문구와 분기 키를 따로 관리하지 않아도 된다.
--
--
-- ## 시간대의 정본
--
-- groups.time_zone과 group_rules.time_zone이 둘 다 있다. **경계 계산의 정본은
-- effective_rule(...)의 time_zone/reset_hour**이고, groups.time_zone은 목록 조회용
-- 사본이다. create_group이 둘에 같은 값을 넣고, 규칙 변경 RPC(0005)가 함께 갱신한다.
--
--
-- ## 알려진 한계
--
-- `frimit_next_period_start`는 `period_start + interval '1 day'`인데 PostgREST 세션의
-- TimeZone이 UTC라 이 덧셈은 정확히 24시간이다. 서머타임이 있는 시간대에서는
-- 전환일 하루가 벽시계 오전 6시와 어긋나고, 벽시계로 다시 계산하는 클라이언트
-- (src/lib/frimit-day.ts의 nextPeriodStartFor)와 답이 갈린다. 베타는 Asia/Seoul
-- 전용이라 지금은 드러나지 않지만, 시간대 선택을 열 때 서버 함수를 벽시계 기준으로
-- 고쳐야 한다.
--
-- 또 하나: groups.admin_id가 `on delete restrict`라 그룹을 관리 중인 사용자는
-- 계정을 지울 수 없다. 계정 삭제(plan.md)를 구현하기 전에 "탈퇴 시 관리자 자동
-- 이전 또는 그룹 보관"이 먼저 있어야 한다.

-- ============================================================================
-- 응답 스냅샷
--
-- 5개 RPC가 모두 같은 모양의 jsonb를 돌려준다. 클라이언트는 스키마 하나로 전부
-- 파싱하고, 어떤 동작 뒤에도 화면을 다시 그릴 수 있는 재료를 한 번에 받는다.
-- ============================================================================

/**
 * 그룹의 현재 상태 + 보는 사람의 멤버십을 한 덩어리로 만든다.
 *
 * ⚠️ security definer라 RLS를 우회한다. **절대 authenticated에 노출하지 않는다.**
 * 노출하면 아무 group_id나 넣어 남의 그룹을 들여다볼 수 있다. 이 파일의 RPC들이
 * 자기 검사를 마친 뒤에만 호출하는 내부 헬퍼다.
 */
create or replace function public.group_snapshot(
  target_group_id uuid,
  viewer_id uuid
) returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'group', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'icon_key', g.icon_key,
      'color_key', g.color_key,
      'status', g.status,
      'invite_code', g.invite_code,
      'time_zone', g.time_zone,
      'admin_id', g.admin_id,
      'started_at', g.started_at,
      'archived_at', g.archived_at,
      'created_at', g.created_at
    ),
    'membership', case when m.id is null then null else jsonb_build_object(
      'role', m.role,
      'is_ready', m.is_ready,
      'effective_from', m.effective_from,
      'effective_until', m.effective_until,
      'joined_at', m.joined_at
    ) end,
    'rule', case when r.id is null then null else jsonb_build_object(
      'daily_limit_seconds', r.daily_limit_seconds,
      'reset_hour', r.reset_hour,
      'time_zone', r.time_zone,
      'version', r.version,
      'effective_from', r.effective_from
    ) end,
    -- 정원(8명)을 세는 기준. 탈퇴 예약자도 포함된다.
    'member_count', (
      select count(*)
        from public.group_memberships s
       where s.group_id = g.id
         and (s.effective_until is null or s.effective_until > now())
    ),
    -- 지금 이 순간 공동 풀에 실제로 잡히는 사람. draft 그룹에서는 0이다.
    'active_member_count', (select count(*) from public.active_member_ids(g.id)),
    -- "내일 오전 6시에 반영돼요" 문구를 클라이언트가 다시 계산하지 않게 실어 준다.
    'next_period_start', public.frimit_next_period_start(
      now(),
      coalesce(r.time_zone, g.time_zone),
      coalesce(r.reset_hour, 6)
    )
  )
    from public.groups g
    left join public.group_memberships m
      on m.group_id = g.id and m.profile_id = viewer_id
    left join lateral public.effective_rule(g.id, now()) r on true
   where g.id = target_group_id;
$$;

comment on function public.group_snapshot is
  '그룹 RPC의 공통 응답. security definer라 RLS를 우회하므로 클라이언트에 노출하지 않는다.';

-- ============================================================================
-- create_group
-- ============================================================================

/**
 * 그룹을 만들고 만든 사람을 관리자로 넣는다. 상태는 draft — 아직 집계하지 않는다.
 *
 * group_rules의 1번 버전도 여기서 함께 만든다. group_rules에는 이 파일의 RPC
 * 말고는 쓰기 경로가 없고 effective_from이 not null이라, 여기서 안 만들면 공동
 * 한도가 존재하지 않는 그룹이 영영 그대로 남는다.
 *
 * 인자 이름에 주의: `name`처럼 컬럼과 같은 이름을 쓰면 plpgsql이 컬럼으로
 * 해석해 조건이 조용히 무너진다. 그래서 `group_name`이다.
 */
create or replace function public.create_group(
  group_name text,
  icon_key text default 'icon-01',
  color_key text default 'color-01',
  time_zone text default 'Asia/Seoul',
  daily_limit_seconds int default 7200,
  reset_hour int default 6
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_group_count int;
  v_attempt int;
  v_constraint text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if char_length(trim(coalesce(group_name, ''))) not between 1 and 20 then
    raise exception '그룹 이름은 1자 이상 20자 이하여야 합니다.'
      using errcode = 'PT400', hint = 'invalid_group_name';
  end if;

  if daily_limit_seconds not between 600 and 86400 then
    raise exception '하루 공동 한도는 10분에서 24시간 사이여야 합니다.'
      using errcode = 'PT400', hint = 'invalid_daily_limit';
  end if;

  -- 같은 사용자가 동시에 여섯 번째 그룹을 만드는 것을 막는다. 서로 다른 그룹
  -- 행을 건드리므로 그룹 잠금으로는 직렬화되지 않아, 본인 프로필 행을 잡는다.
  perform 1 from public.profiles p where p.id = v_actor for no key update;
  if not found then
    raise exception '프로필을 찾을 수 없습니다. 다시 로그인해 주세요.'
      using errcode = '42501', hint = 'profile_not_found';
  end if;

  select count(*) into v_group_count
    from public.group_memberships m
    join public.groups g on g.id = m.group_id
   where m.profile_id = v_actor
     and g.status <> 'archived'
     and (m.effective_until is null or m.effective_until > now());

  if v_group_count >= 5 then
    raise exception '참여할 수 있는 그룹은 최대 5개입니다.'
      using errcode = 'PT409', hint = 'too_many_groups';
  end if;

  -- generate_invite_code()는 "확인 후 사용" 사이에 잠금이 없어 경합이 남는다.
  -- 삽입을 서브트랜잭션으로 감싸 충돌하면 다시 뽑는다. 코드 공간이 100만이고
  -- 활성 그룹은 그보다 훨씬 적으므로 다섯 번이면 충분하다.
  for v_attempt in 1..5 loop
    begin
      insert into public.groups (
        name, icon_key, color_key, admin_id, time_zone, status, invite_code
      ) values (
        trim(group_name),
        icon_key,
        color_key,
        v_actor,
        time_zone,
        'draft',
        public.generate_invite_code()
      )
      returning * into v_group;

      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- 초대 코드 충돌이 아니면 우리가 다룰 문제가 아니다.
      if v_constraint is distinct from 'groups_invite_code_active' then
        raise;
      end if;

      if v_attempt = 5 then
        raise exception '초대 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          using errcode = 'PT409', hint = 'invite_code_unavailable';
      end if;
    end;
  end loop;

  -- role은 groups.admin_id의 거울이다. 정본은 admin_id(= is_group_admin이 보는 곳).
  insert into public.group_memberships (group_id, profile_id, role, effective_from)
  values (v_group.id, v_actor, 'admin', null);

  insert into public.group_rules (
    group_id, daily_limit_seconds, reset_hour, time_zone, version, effective_from
  ) values (
    v_group.id,
    daily_limit_seconds,
    reset_hour,
    time_zone,
    1,
    -- 규칙은 오전 6시 경계에 걸린다. 직전 경계를 쓰므로 즉시 유효하다.
    public.frimit_period_start(now(), time_zone, reset_hour)
  );

  return public.group_snapshot(v_group.id, v_actor);
end;
$$;

comment on function public.create_group is
  '그룹(draft) + 관리자 멤버십 + 규칙 1번 버전을 함께 만든다. 사용자당 5그룹 제한.';

-- ============================================================================
-- join_group
-- ============================================================================

/**
 * 초대 코드로 가입한다.
 *
 * 이 함수만 security definer가 "권한 승격" 이상의 의미를 갖는다. groups의 조회
 * 정책은 `is_group_member(id)`인데, 가입하려는 사람은 정의상 아직 멤버가 아니다.
 * 초대 코드를 아는 사람만 그 한 행을 볼 수 있게 여기서 열어 준다.
 *
 * unique (group_id, profile_id) 때문에 재가입은 insert가 아니라 update다.
 * 기존 행의 상태에 따라 셋으로 갈린다:
 *
 * - 탈퇴 예약 중(effective_until이 미래): **철회**. effective_until만 지우고
 *   effective_from은 건드리지 않는다. 밤 10시에 나가고 11시에 마음을 바꾼 사람은
 *   여전히 오늘 풀을 쓰는 중이고, 자리도 계속 차지하고 있었다.
 * - 탈퇴가 이미 반영됨(과거): **되살리기**. 새 가입과 같은 상태로 리셋하고
 *   상한 검사도 다시 받는다.
 * - 아직 멤버: 오류.
 */
create or replace function public.join_group(target_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_membership public.group_memberships;
  -- FOUND는 바로 다음 조회가 덮어쓴다. 좌석을 세고 나서도 "기존 행이 있었는지"를
  -- 알아야 하므로 그 사실만 따로 붙잡아 둔다.
  v_has_membership boolean := false;
  v_time_zone text;
  v_reset_hour int;
  v_group_count int;
  v_seat_count int;
  v_effective_from timestamptz;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  perform 1 from public.profiles p where p.id = v_actor for no key update;
  if not found then
    raise exception '프로필을 찾을 수 없습니다. 다시 로그인해 주세요.'
      using errcode = '42501', hint = 'profile_not_found';
  end if;

  -- 이 그룹으로 들어오는 모든 가입이 여기서 줄을 선다. 아홉 번째 동시 가입은
  -- 앞사람이 커밋을 마친 뒤에야 좌석을 세게 되므로 정원을 넘길 수 없다.
  -- groups_invite_code_active 부분 유니크 인덱스 덕분에 이 조회는 최대 한 행이다.
  select * into v_group
    from public.groups g
   where g.invite_code = target_invite_code
     and g.status <> 'archived'
     for no key update;

  if not found then
    raise exception '초대 코드가 올바르지 않습니다.'
      using errcode = 'PT404', hint = 'invalid_invite_code';
  end if;

  v_rule := public.effective_rule(v_group.id, now());
  v_time_zone := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset_hour := coalesce(v_rule.reset_hour, 6);

  select * into v_membership
    from public.group_memberships m
   where m.group_id = v_group.id
     and m.profile_id = v_actor;

  v_has_membership := found;

  -- 탈퇴 철회. 자리를 놓은 적이 없으므로 상한도 다시 세지 않는다.
  if v_has_membership and v_membership.effective_until is not null
     and v_membership.effective_until > now() then
    update public.group_memberships
       set effective_until = null
     where id = v_membership.id;

    return public.group_snapshot(v_group.id, v_actor);
  end if;

  if v_has_membership and v_membership.effective_until is null then
    raise exception '이미 참여 중인 그룹입니다.'
      using errcode = 'PT409', hint = 'already_member';
  end if;

  select count(*) into v_group_count
    from public.group_memberships m
    join public.groups g on g.id = m.group_id
   where m.profile_id = v_actor
     and g.status <> 'archived'
     and (m.effective_until is null or m.effective_until > now());

  if v_group_count >= 5 then
    raise exception '참여할 수 있는 그룹은 최대 5개입니다.'
      using errcode = 'PT409', hint = 'too_many_groups';
  end if;

  select count(*) into v_seat_count
    from public.group_memberships m
   where m.group_id = v_group.id
     and (m.effective_until is null or m.effective_until > now());

  if v_seat_count >= 8 then
    raise exception '이 그룹은 이미 정원(8명)이 찼습니다.'
      using errcode = 'PT409', hint = 'group_full';
  end if;

  -- 시작 전 그룹은 시작 시각에 일괄로 채운다. 시작한 그룹은 다음 오전 6시부터.
  v_effective_from := case
    when v_group.status = 'draft' then null
    else public.frimit_next_period_start(now(), v_time_zone, v_reset_hour)
  end;

  if v_has_membership then
    -- 되살리기. 예전 role과 준비 상태를 물려받지 않는다.
    update public.group_memberships
       set role = 'member',
           is_ready = false,
           effective_from = v_effective_from,
           effective_until = null,
           joined_at = now()
     where id = v_membership.id;
  else
    insert into public.group_memberships (
      group_id, profile_id, role, effective_from
    ) values (
      v_group.id, v_actor, 'member', v_effective_from
    );
  end if;

  return public.group_snapshot(v_group.id, v_actor);
end;
$$;

comment on function public.join_group is
  '초대 코드로 가입한다. 정원 8명, 사용자당 5그룹. 탈퇴 예약 중이면 철회로 처리한다.';

-- ============================================================================
-- start_group
-- ============================================================================

/**
 * 관리자가 그룹을 시작한다. 이 순간부터 공동 풀이 돈다.
 *
 * 준비된 멤버가 2명 이상이어야 한다(관리자를 그 수에 포함해 세되, 관리자 본인이
 * 준비를 마쳤을 것까지 요구하지는 않는다).
 *
 * 준비하지 않은 멤버도 effective_from을 받는다. 공동 한도는 인원수에 비례하지
 * 않으므로 그들이 들어와도 풀 계산이 달라지지 않고, 사용량이 0으로 보고될 뿐이며
 * 권한 상태는 이미 따로 드러난다. 반대로 하면 "그룹은 시작됐는데 나는 멤버가
 * 아님"이라는 설명할 수 없는 상태가 생긴다.
 */
create or replace function public.start_group(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_ready_count int;
  v_started_at timestamptz;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  if v_group.status = 'archived' then
    raise exception '이미 보관된 그룹입니다.'
      using errcode = 'PT409', hint = 'group_archived';
  end if;

  if v_group.admin_id <> v_actor then
    raise exception '관리자만 할 수 있는 작업입니다.'
      using errcode = '42501', hint = 'not_admin';
  end if;

  if v_group.status = 'active' then
    raise exception '이미 시작된 그룹입니다.'
      using errcode = 'PT409', hint = 'already_started';
  end if;

  select count(*) into v_ready_count
    from public.group_memberships m
   where m.group_id = v_group.id
     and m.is_ready
     and (m.effective_until is null or m.effective_until > now());

  if v_ready_count < 2 then
    raise exception '준비된 멤버가 2명 이상이어야 시작할 수 있습니다.'
      using errcode = 'PT409', hint = 'not_enough_ready';
  end if;

  v_started_at := now();

  update public.groups
     set status = 'active',
         started_at = v_started_at
   where id = v_group.id;

  -- 아직 반영 시각이 없는 멤버 전원이 이 순간부터 집계에 들어간다.
  -- effective_until 조건이 "draft에서 이미 나간 사람"을 알아서 걸러 낸다.
  update public.group_memberships
     set effective_from = v_started_at
   where group_id = v_group.id
     and effective_from is null
     and effective_until is null;

  return public.group_snapshot(v_group.id, v_actor);
end;
$$;

comment on function public.start_group is
  '관리자가 그룹을 시작한다. 준비된 멤버 2명 이상 필요. 대기 중인 멤버십에 시작 시각을 채운다.';

-- ============================================================================
-- leave_group
-- ============================================================================

/**
 * 그룹에서 나간다. 시작한 그룹이면 다음 오전 6시에 반영된다.
 *
 * 관리자는 먼저 권한을 넘겨야 하지만, **어차피 보관될 그룹이라면 면제한다.**
 * plan.md의 두 문장("관리자는 이전 후에 탈퇴", "활성 2명 미만이면 보관")을 함께
 * 읽으면 권한 이전은 그룹이 계속 돌아가기 위한 조건이다. 둘만 남은 그룹에서
 * "먼저 넘기세요 → 넘기자마자 보관됩니다"를 시키는 건 순수한 마찰이고, 최악의
 * 경우 관리자가 영영 나가지 못한다.
 *
 * 보관은 예약하지 않고 즉시 한다. 2명 미만이 되는 순간 공동 견제라는 그룹의
 * 의미가 사라지고, 예약하려면 이 스키마에 없는 스케줄러가 필요하다.
 */
create or replace function public.leave_group(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_membership public.group_memberships;
  v_remaining int;
  v_will_archive boolean;
  v_leaves_at timestamptz;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  if v_group.status = 'archived' then
    raise exception '이미 보관된 그룹입니다.'
      using errcode = 'PT409', hint = 'group_archived';
  end if;

  select * into v_membership
    from public.group_memberships m
   where m.group_id = v_group.id
     and m.profile_id = v_actor
     and (m.effective_until is null or m.effective_until > now());

  if not found then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  select count(*) into v_remaining
    from public.group_memberships m
   where m.group_id = v_group.id
     and m.profile_id <> v_actor
     and (m.effective_until is null or m.effective_until > now());

  v_will_archive := v_remaining < 2;

  if v_group.admin_id = v_actor and not v_will_archive then
    raise exception '탈퇴하기 전에 관리자 권한을 다른 멤버에게 넘겨 주세요.'
      using errcode = 'PT409', hint = 'admin_must_transfer';
  end if;

  v_rule := public.effective_rule(v_group.id, now());

  v_leaves_at := case
    when v_group.status = 'draft' then now()
    else public.frimit_next_period_start(
      now(),
      coalesce(v_rule.time_zone, v_group.time_zone),
      coalesce(v_rule.reset_hour, 6)
    )
  end;

  update public.group_memberships
     set effective_until = v_leaves_at
   where id = v_membership.id;

  if v_will_archive then
    update public.groups
       set status = 'archived',
           archived_at = now()
     where id = v_group.id;
  end if;

  -- 반영 시각과 보관 여부가 응답에 그대로 들어간다. 화면 문구는 그걸로 고른다.
  return public.group_snapshot(v_group.id, v_actor);
end;
$$;

comment on function public.leave_group is
  '탈퇴를 예약한다(시작한 그룹이면 다음 오전 6시). 남는 좌석이 2명 미만이면 그룹을 즉시 보관한다.';

-- ============================================================================
-- transfer_admin
-- ============================================================================

/**
 * 관리자 권한을 다른 멤버에게 넘긴다.
 *
 * 탈퇴를 예약한 멤버에게는 넘길 수 없다. 오전 6시에 나갈 사람에게 넘기면
 * "관리자가 없는 그룹"이 되어 애초에 이전을 강제한 이유가 그대로 재발한다.
 */
create or replace function public.transfer_admin(
  target_group_id uuid,
  new_admin_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_target public.group_memberships;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  if v_group.status = 'archived' then
    raise exception '이미 보관된 그룹입니다.'
      using errcode = 'PT409', hint = 'group_archived';
  end if;

  if v_group.admin_id <> v_actor then
    raise exception '관리자만 할 수 있는 작업입니다.'
      using errcode = '42501', hint = 'not_admin';
  end if;

  if new_admin_id = v_actor then
    raise exception '이미 이 그룹의 관리자입니다.'
      using errcode = 'PT400', hint = 'already_admin';
  end if;

  select * into v_target
    from public.group_memberships m
   where m.group_id = v_group.id
     and m.profile_id = new_admin_id;

  if not found or v_target.effective_until <= now() then
    raise exception '그 사람은 이 그룹의 멤버가 아닙니다.'
      using errcode = 'PT409', hint = 'target_not_member';
  end if;

  if v_target.effective_until is not null then
    raise exception '탈퇴를 예약한 멤버에게는 관리자 권한을 넘길 수 없습니다.'
      using errcode = 'PT409', hint = 'target_leaving';
  end if;

  update public.groups
     set admin_id = new_admin_id
   where id = v_group.id;

  update public.group_memberships
     set role = 'admin'
   where group_id = v_group.id
     and profile_id = new_admin_id;

  update public.group_memberships
     set role = 'member'
   where group_id = v_group.id
     and profile_id = v_actor;

  return public.group_snapshot(v_group.id, v_actor);
end;
$$;

comment on function public.transfer_admin is
  '관리자 권한을 다른 멤버에게 넘긴다. 탈퇴를 예약한 멤버는 받을 수 없다.';

-- ============================================================================
-- 직접 쓰기 경로 좁히기
--
-- 위 RPC들이 상한과 절차를 지키게 하려면, 같은 일을 테이블에 직접 써서 할 수
-- 있으면 안 된다. 그런데 0002는 두 테이블에 update 권한을 통째로 줬다.
--
-- - group_memberships: 멤버가 자기 effective_from을 과거로 당기거나(집계에 직접
--   영향), 예약된 effective_until을 지우거나, role='admin'을 자칭할 수 있었다.
-- - groups: 관리자가 start_group을 건너뛰고 status='active'를 직접 쓰거나
--   invite_code·admin_id를 바꿀 수 있었다.
--
-- RLS는 **행**을 고르는 장치이지 컬럼을 고르는 장치가 아니다. 그래서 정책은
-- 그대로 두고 GRANT를 컬럼 단위로 좁힌다. 0002의 결정을 여기서 되돌린다.
-- ============================================================================

revoke update on table public.group_memberships from authenticated;
-- 준비 토글은 별도 RPC 없이 본인이 직접 켜도 되는 유일한 값이다.
grant update (is_ready) on table public.group_memberships to authenticated;

revoke update on table public.groups from authenticated;
-- 이름·아이콘·색은 관리자가 언제든 바꿔도 집계에 영향이 없다.
-- time_zone은 전원 동의 대상(0005)이므로 여기 넣지 않는다.
grant update (name, icon_key, color_key) on table public.groups to authenticated;

-- ============================================================================
-- 권한 (GRANT)
--
-- create function은 EXECUTE를 PUBLIC에 자동으로 준다. PUBLIC을 통해 얻은 권한은
-- 특정 롤에서 revoke해도 사라지지 않으므로, anon을 확실히 막으려면 PUBLIC에서
-- 먼저 회수해야 한다. service_role은 0003의 default privileges로 자동 적용된다.
-- ============================================================================

revoke execute on function public.group_snapshot(uuid, uuid) from public;

revoke execute on function public.create_group(text, text, text, text, int, int) from public;
grant execute on function public.create_group(text, text, text, text, int, int) to authenticated;

revoke execute on function public.join_group(text) from public;
grant execute on function public.join_group(text) to authenticated;

revoke execute on function public.start_group(uuid) from public;
grant execute on function public.start_group(uuid) to authenticated;

revoke execute on function public.leave_group(uuid) from public;
grant execute on function public.leave_group(uuid) to authenticated;

revoke execute on function public.transfer_admin(uuid, uuid) from public;
grant execute on function public.transfer_admin(uuid, uuid) to authenticated;
