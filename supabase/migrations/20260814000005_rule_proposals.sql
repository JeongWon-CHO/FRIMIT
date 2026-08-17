-- 규칙 변경 전원 동의 절차 (rule_proposals / rule_approvals)
--
-- 0002가 group_rules에 select만 열어 두고 "변경은 전원 동의 절차를 거쳐 RPC로만"
-- 이라고 적어 둔 그 RPC가 이 파일이다. 0004의 머리말도 "규칙 변경 RPC"가
-- groups.time_zone 사본을 함께 갱신할 것이라고 예고해 두었다.
--
-- plan.md 36~37행이 정한 것은 두 문장이다.
--   · 공동 한도·초기화 시각·시간대 변경은 활성 멤버 전원의 동의를 받은 뒤 다음 오전 6시에 적용
--   · 변경안은 48시간 동안 유효하며 미동의자가 있으면 만료된다
--
--
-- ## 적용에 스케줄러가 필요 없는 이유
--
-- 0002는 규칙을 덮어쓰지 않고 `effective_from`을 가진 버전으로 쌓게 해 두었고,
-- `effective_rule(group, t)`은 `effective_from <= t` 중 최신 버전을 고른다.
-- 그러므로 **전원 동의가 완성되는 순간 미래 시각의 규칙 행을 그냥 넣어 두면**
-- 내일 오전 6시에 저절로 유효해진다. 가입·탈퇴가 effective_from/until로 예약되는
-- 것과 정확히 같은 방식이고, 이 스키마에 없는 예약 작업을 새로 들이지 않아도 된다.
--
-- 그래서 '적용됨'이라는 상태를 따로 두지 않는다. 승인된 변경안의 `effective_from`이
-- 지났는지를 보면 알 수 있고, 상태를 하나 더 두면 그것을 옮겨 줄 스케줄러가 다시
-- 필요해진다.
--
--
-- ## 판정은 읽을 때 미뤄서 한다 (lazy settlement)
--
-- 만료도 같은 문제를 갖는다. 48시간이 지났다는 사실을 알려 줄 주체가 없다.
-- `settle_rule_proposal`이 만료와 완성을 **누가 이 변경안을 건드릴 때마다** 판정한다
-- — 응답할 때, 철회할 때, 화면이 조회할 때, 새 변경안을 낼 때.
--
-- 아무도 보지 않는 동안 pending으로 남아 있는 변경안은 있을 수 있지만, 그 상태를
-- 실제로 읽는 모든 경로가 먼저 판정을 돌리므로 밖에서는 관측되지 않는다.
-- 조회 RPC가 stable이 아니라 volatile인 이유가 이것이다.
--
--
-- ## 누가 동의해야 하는가
--
-- **떠날 사람에게는 묻지 않고, 내일 올 사람에게는 묻는다.** 변경은 다음 오전 6시에
-- 적용되므로 기준은 "그때 이 규칙 아래서 살고 있을 사람"이다. 즉 탈퇴를 예약하지
-- 않은 멤버 전원(`effective_until is null`)이고, 오늘 가입해 내일 6시부터 반영되는
-- 사람도 여기 들어간다.
--
-- 그 명단은 변경안을 낼 때 rule_approvals에 한 줄씩 **고정**한다. 48시간 창 도중에
-- 멤버가 드나든다고 동의 기준이 움직이면, 마지막 한 명이 승인하는 순간 새 멤버가
-- 들어와 다시 미달이 되는 일이 생긴다. plan.md가 공동 목표의 참여자를 시작 시점에
-- 고정한 것과 같은 이유다.
--
-- 반대 방향, 즉 동의를 기다리던 사람이 그사이 나가 버린 경우는 명단을 고정한 채로
-- 판정에서만 제외한다(`rule_voter_ids`). 고정된 명단이 영영 채워지지 않아 48시간을
-- 통째로 기다렸다가 만료되는 것은 아무에게도 도움이 되지 않는다.
--
--
-- ## plan.md에 없는 것 둘
--
-- 1. **거절(reject).** plan.md는 "미동의자가 있으면 만료"만 정했다. 거절은 그
--    만료를 앞당기는 것일 뿐 새로운 결과를 만들지 않지만, 제안자가 48시간을
--    침묵 속에서 기다리지 않아도 된다. 화면의 "멤버별 승인 상태"(plan.md 84행)도
--    '아직 안 봤음'과 '싫음'을 구분해서 보여줄 수 있다.
--
-- 2. **draft 그룹의 즉시 수정(`update_draft_rule`).** 시작 전 그룹에는 돌아가는
--    공동 풀이 없고 지킬 공정성도 없다. 그런데 create_group 말고는 group_rules에
--    쓰기 경로가 없어서, 지금 스키마로는 시작 전에 한도 오타를 고치는 방법이
--    아예 없다(plan.md 83행의 그룹 관리 화면에는 공동 한도 편집이 있다).
--    전원 동의는 시작한 그룹에만 요구한다.
--
--
-- ## 잠금
--
-- 0004의 순서를 이어받아 **groups → rule_proposals**로 잡는다. 변경안 id만 들고
-- 들어오는 경로(응답·철회·조회)도 그룹 행을 먼저 잡고 나서 변경안 행을 잡는다.
-- 반대로 잡는 곳이 하나라도 있으면 그 둘 사이에 데드락이 생긴다.

-- ============================================================================
-- 표
-- ============================================================================

create type public.rule_proposal_status as enum (
  -- 동의를 기다리는 중. 그룹당 하나만 존재할 수 있다.
  'pending',
  -- 전원 동의 완료. 새 규칙 버전이 다음 오전 6시로 예약되어 있다.
  'approved',
  -- 누군가 거절했다.
  'rejected',
  -- 제안자 또는 관리자가 거뒀다.
  'withdrawn',
  -- 48시간 안에 전원 동의가 모이지 않았거나, 그사이 그룹이 보관됐다.
  'expired'
);

create type public.rule_decision as enum ('pending', 'approved', 'rejected');

create table public.rule_proposals (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.groups(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,

  -- 바뀐 값만이 아니라 **적용 후의 규칙 전체**를 담는다. 화면의 변경안 비교도,
  -- 승인 뒤 group_rules에 넣을 값도 이 세 컬럼에서 그대로 나온다.
  daily_limit_seconds int not null
    constraint proposed_daily_limit_range check (daily_limit_seconds between 600 and 86400),
  reset_hour int not null
    constraint proposed_reset_hour_range check (reset_hour between 0 and 23),
  time_zone text not null,

  -- 무엇과 비교해 만든 변경안인가. 화면이 "이전 → 이후"를 그릴 때 쓴다.
  base_version int not null,

  status public.rule_proposal_status not null default 'pending',

  -- 생성 + 48시간 (plan.md 37행).
  expires_at timestamptz not null,

  -- 전원 동의가 완성된 뒤 예약된 적용 시각(다음 오전 6시). 그 전에는 null이다.
  effective_from timestamptz,

  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resolution_time_matches_status
    check ((status = 'pending') = (resolved_at is null)),
  constraint effective_from_only_when_approved
    check ((status = 'approved') = (effective_from is not null))
);

comment on table public.rule_proposals is
  '규칙 변경안. 전원 동의가 모이면 group_rules에 다음 오전 6시로 예약된 버전이 생긴다.';
comment on column public.rule_proposals.effective_from is
  '승인된 변경안이 실제로 유효해지는 시각. 화면의 "적용 예정 시각"이 이 값이다.';

-- 그룹당 진행 중인 변경안은 하나. 두 개가 동시에 돌면 어느 쪽이 이겼는지
-- 아무도 설명할 수 없고, 각자 동의를 모으다 서로를 덮어쓴다.
create unique index rule_proposals_one_pending_per_group
  on public.rule_proposals (group_id)
  where status = 'pending';

create index rule_proposals_group_idx
  on public.rule_proposals (group_id, created_at desc);

create trigger rule_proposals_set_updated_at
  before update on public.rule_proposals
  for each row execute function public.set_updated_at();

create table public.rule_approvals (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references public.rule_proposals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- 행은 변경안을 낼 때 동의가 필요한 사람 수만큼 미리 만들어진다.
  -- 그래서 '아직 안 함'이 값이 없는 상태가 아니라 명시적인 상태다.
  decision public.rule_decision not null default 'pending',
  decided_at timestamptz,

  created_at timestamptz not null default now(),

  constraint one_decision_per_member unique (proposal_id, profile_id),
  constraint decision_time_matches_decision
    check ((decision = 'pending') = (decided_at is null))
);

comment on table public.rule_approvals is
  '변경안별 동의 명단. 변경안 생성 시점에 고정되며, 행의 존재 자체가 "이 사람의 동의가 필요하다"는 뜻이다.';

create index rule_approvals_proposal_idx on public.rule_approvals (proposal_id);

-- ============================================================================
-- 헬퍼
-- ============================================================================

/**
 * 예약된 미래 버전을 포함한 가장 최신 규칙.
 *
 * `effective_rule`은 "지금 유효한" 규칙을 주므로 변경안의 기준으로 쓸 수 없다.
 * 오늘 승인되어 내일 6시로 예약된 규칙이 있다면, 다음 변경안은 그것을 딛고
 * 서야 한다. 그러지 않으면 방금 합의한 내용을 모르는 채로 비교 화면이 그려진다.
 */
create or replace function public.latest_rule(target_group_id uuid)
returns public.group_rules
language sql
security definer
stable
set search_path = ''
as $$
  select r.*
    from public.group_rules r
   where r.group_id = target_group_id
   order by r.version desc
   limit 1;
$$;

/**
 * 규칙 변경에 동의해야 하는 사람들 = 탈퇴를 예약하지 않은 멤버 전원.
 *
 * `active_member_ids`(지금 이 순간 집계에 잡히는 사람)와 다르다. 오늘 가입해
 * 내일 6시부터 반영되는 사람은 아직 활성 멤버가 아니지만, 새 규칙 아래서
 * 살게 될 사람이므로 물어야 한다.
 */
create or replace function public.rule_voter_ids(target_group_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.profile_id
    from public.group_memberships m
   where m.group_id = target_group_id
     and m.effective_until is null;
$$;

comment on function public.rule_voter_ids is
  '규칙 변경 동의가 필요한 멤버. 떠날 사람은 빠지고, 내일 반영될 가입자는 들어간다.';

/**
 * 이 변경안을 볼 수 있는가. rule_approvals의 조회 정책이 쓴다.
 *
 * 0002의 `shares_group_with`와 같은 이유로 security definer다 — 정책 안에서
 * rule_proposals를 직접 조회하면 그 표의 정책이 다시 평가된다.
 *
 * 이 함수는 PUBLIC에서 회수하지 않는다. 정책은 조회하는 롤의 권한으로 평가되므로
 * authenticated가 실행할 수 있어야 한다. auth.uid()가 없으면 항상 false다.
 */
create or replace function public.can_see_proposal(target_proposal_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.rule_proposals p
     where p.id = target_proposal_id
       and public.is_group_member(p.group_id)
  );
$$;

-- ============================================================================
-- 응답 스냅샷
-- ============================================================================

/**
 * 변경안 하나 + 비교 기준 + 멤버별 승인 상태. plan.md 84행의 규칙 변경 화면이
 * 필요로 하는 재료 전부다.
 *
 * ⚠️ 0004의 group_snapshot과 같다. security definer라 RLS를 우회하므로
 * **절대 authenticated에 노출하지 않는다.**
 */
create or replace function public.rule_proposal_snapshot(
  target_proposal_id uuid,
  viewer_id uuid
) returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'proposal', jsonb_build_object(
      'id', p.id,
      'group_id', p.group_id,
      'proposer_id', p.proposer_id,
      'daily_limit_seconds', p.daily_limit_seconds,
      'reset_hour', p.reset_hour,
      'time_zone', p.time_zone,
      'base_version', p.base_version,
      'status', p.status,
      'expires_at', p.expires_at,
      'effective_from', p.effective_from,
      'resolved_at', p.resolved_at,
      'created_at', p.created_at
    ),
    -- 변경안을 만들 때의 기준 규칙. "이전 → 이후"의 왼쪽이다.
    'base_rule', case when b.id is null then null else jsonb_build_object(
      'daily_limit_seconds', b.daily_limit_seconds,
      'reset_hour', b.reset_hour,
      'time_zone', b.time_zone,
      'version', b.version,
      'effective_from', b.effective_from
    ) end,
    'approvals', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'profile_id', a.profile_id,
               'decision', a.decision,
               'decided_at', a.decided_at
             ) order by a.created_at), '[]'::jsonb)
        from public.rule_approvals a
       where a.proposal_id = p.id
    ),
    'my_decision', (
      select a.decision
        from public.rule_approvals a
       where a.proposal_id = p.id
         and a.profile_id = viewer_id
    ),
    'required_count', (
      select count(*) from public.rule_approvals a where a.proposal_id = p.id
    ),
    -- 남은 사람 수. 화면의 "3명 중 1명 남음"이 이 값이다.
    'pending_count', (
      select count(*)
        from public.rule_approvals a
       where a.proposal_id = p.id
         and a.decision = 'pending'
    )
  )
    from public.rule_proposals p
    left join lateral (
      select r.* from public.group_rules r
       where r.group_id = p.group_id and r.version = p.base_version
    ) b on true
   where p.id = target_proposal_id;
$$;

comment on function public.rule_proposal_snapshot is
  '규칙 변경 RPC의 공통 응답. security definer라 RLS를 우회하므로 클라이언트에 노출하지 않는다.';

-- ============================================================================
-- settle_rule_proposal — 만료와 완성 판정
-- ============================================================================

/**
 * pending인 변경안 하나를 지금 시점에서 판정한다. 이 파일의 모든 경로가
 * 변경안을 읽거나 고치기 **전에** 이것을 먼저 부른다.
 *
 * 판정 순서에 의미가 있다.
 *   1. 거절이 하나라도 있으면 거기서 끝. 48시간을 기다릴 이유가 없다.
 *   2. 그룹이 보관됐으면 적용될 대상이 없다.
 *   3. 아직 답하지 않은 **현재 멤버**가 남아 있으면 pending 유지, 단 48시간이
 *      지났으면 만료.
 *   4. 아무도 남지 않았으면 전원 동의 — 새 규칙 버전을 다음 오전 6시로 예약한다.
 *
 * 3에서 "현재 멤버"로 한정하는 덕분에, 동의를 기다리던 사람이 그사이 탈퇴하면
 * 그 자리는 자동으로 비워진다. 마지막 한 명이 나가면서 전원 동의가 완성되는
 * 경우도 있는데, 그때는 아무도 이 함수를 부르지 않으므로 다음 조회에서 반영된다.
 */
create or replace function public.settle_rule_proposal(target_proposal_id uuid)
returns public.rule_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_group public.groups;
  v_proposal public.rule_proposals;
  v_rule public.group_rules;
  v_apply_at timestamptz;
  v_next_version int;
begin
  select p.group_id into v_group_id
    from public.rule_proposals p
   where p.id = target_proposal_id;

  if not found then
    return null;
  end if;

  -- 잠금 순서: groups → rule_proposals (0004와 같은 방향).
  select * into v_group from public.groups g where g.id = v_group_id for no key update;

  select * into v_proposal
    from public.rule_proposals p
   where p.id = target_proposal_id
     for update;

  if v_proposal.status <> 'pending' then
    return v_proposal;
  end if;

  if exists (
    select 1 from public.rule_approvals a
     where a.proposal_id = v_proposal.id
       and a.decision = 'rejected'
  ) then
    update public.rule_proposals
       set status = 'rejected', resolved_at = now()
     where id = v_proposal.id
     returning * into v_proposal;
    return v_proposal;
  end if;

  if v_group.status = 'archived' then
    update public.rule_proposals
       set status = 'expired', resolved_at = now()
     where id = v_proposal.id
     returning * into v_proposal;
    return v_proposal;
  end if;

  if exists (
    select 1 from public.rule_approvals a
     where a.proposal_id = v_proposal.id
       and a.decision = 'pending'
       and a.profile_id in (
             select vid from public.rule_voter_ids(v_proposal.group_id) as vid
           )
  ) then
    if now() >= v_proposal.expires_at then
      update public.rule_proposals
         set status = 'expired', resolved_at = now()
       where id = v_proposal.id
       returning * into v_proposal;
    end if;

    return v_proposal;
  end if;

  -- 전원 동의. 경계는 **지금 유효한 규칙**으로 계산한다. 변경안이 reset_hour를
  -- 5시로 바꾸더라도 전환 자체는 현재 규칙의 다음 경계(내일 6시)에 일어나야 한다.
  -- 새 값으로 계산하면 오늘 5시가 이미 지났다는 이유로 경계가 하루 밀리거나,
  -- 아직 오지 않았다는 이유로 오늘 안에 규칙이 바뀌어 진행 중인 하루가 흔들린다.
  v_rule := public.effective_rule(v_proposal.group_id, now());
  v_apply_at := public.frimit_next_period_start(
    now(),
    coalesce(v_rule.time_zone, v_group.time_zone),
    coalesce(v_rule.reset_hour, 6)
  );

  -- effective_rule은 (effective_from desc, version desc)로 고른다. 같은 6시에
  -- 두 변경안이 예약되면 나중에 승인된 쪽이 높은 버전을 받아 이긴다.
  select coalesce(max(r.version), 0) + 1 into v_next_version
    from public.group_rules r
   where r.group_id = v_proposal.group_id;

  insert into public.group_rules (
    group_id, daily_limit_seconds, reset_hour, time_zone, version, effective_from
  ) values (
    v_proposal.group_id,
    v_proposal.daily_limit_seconds,
    v_proposal.reset_hour,
    v_proposal.time_zone,
    v_next_version,
    v_apply_at
  );

  -- 0004가 예고한 사본 갱신. groups.time_zone은 목록 조회용 사본이고 경계 계산의
  -- 정본은 언제나 effective_rule 쪽이므로(규칙 1번 버전은 create_group이 반드시
  -- 만든다), 여기서 미리 바꿔도 계산에는 영향이 없다. 대신 적용 전 최대 24시간
  -- 동안 사본이 하루 앞서 간다 — 목록에 시간대를 그대로 노출한다면 정본인
  -- effective_rule의 값을 쓸 것.
  update public.groups
     set time_zone = v_proposal.time_zone
   where id = v_proposal.group_id;

  update public.rule_proposals
     set status = 'approved',
         effective_from = v_apply_at,
         resolved_at = now()
   where id = v_proposal.id
   returning * into v_proposal;

  return v_proposal;
end;
$$;

comment on function public.settle_rule_proposal is
  '변경안의 만료·거절·전원 동의를 지금 시점에서 판정한다. 승인되면 새 규칙 버전을 다음 오전 6시로 예약한다.';

-- ============================================================================
-- propose_rule_change
-- ============================================================================

/**
 * 규칙 변경안을 낸다. 바꾸고 싶은 값만 넘기고 나머지는 null로 두면 현재 값이 된다.
 *
 * 제안자를 관리자로 제한하지 않는다. 어차피 전원 동의가 있어야 적용되므로 제한이
 * 막아 주는 것이 없고, 한도가 답답한 사람은 대체로 관리자가 아니다. 대신 그룹당
 * 하나뿐인 자리를 누가 점거하는 문제가 남는데, 관리자가 철회할 수 있게 해서 푼다.
 */
create or replace function public.propose_rule_change(
  target_group_id uuid,
  proposed_daily_limit_seconds int default null,
  proposed_reset_hour int default null,
  proposed_time_zone text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_base public.group_rules;
  v_existing public.rule_proposals;
  v_limit int;
  v_reset_hour int;
  v_time_zone text;
  v_proposal public.rule_proposals;
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

  if not public.is_group_member(v_group.id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  if v_group.status = 'archived' then
    raise exception '이미 보관된 그룹입니다.'
      using errcode = 'PT409', hint = 'group_archived';
  end if;

  -- 시작 전 그룹은 동의를 모을 이유가 없다. 관리자가 바로 고친다.
  if v_group.status = 'draft' then
    raise exception '아직 시작하지 않은 그룹입니다. 관리자가 바로 수정할 수 있습니다.'
      using errcode = 'PT409', hint = 'group_not_started';
  end if;

  if not exists (
    select 1 from public.rule_voter_ids(v_group.id) as vid where vid = v_actor
  ) then
    raise exception '탈퇴를 예약한 상태에서는 규칙 변경을 제안할 수 없습니다.'
      using errcode = 'PT409', hint = 'member_leaving';
  end if;

  -- 앞선 변경안이 만료됐는데 아무도 그것을 읽지 않아 pending으로 남아 있을 수 있다.
  -- 판정을 먼저 돌려야 부분 유니크 인덱스에 헛되이 막히지 않는다.
  select * into v_existing
    from public.rule_proposals p
   where p.group_id = v_group.id
     and p.status = 'pending';

  if found then
    v_existing := public.settle_rule_proposal(v_existing.id);

    if v_existing.status = 'pending' then
      raise exception '이미 진행 중인 변경안이 있습니다.'
        using errcode = 'PT409', hint = 'proposal_exists';
    end if;
  end if;

  v_base := public.latest_rule(v_group.id);

  if v_base.id is null then
    raise exception '이 그룹에는 규칙이 없습니다.'
      using errcode = 'PT409', hint = 'rule_not_found';
  end if;

  v_limit := coalesce(proposed_daily_limit_seconds, v_base.daily_limit_seconds);
  v_reset_hour := coalesce(proposed_reset_hour, v_base.reset_hour);
  v_time_zone := coalesce(proposed_time_zone, v_base.time_zone);

  if v_limit not between 600 and 86400 then
    raise exception '하루 공동 한도는 10분에서 24시간 사이여야 합니다.'
      using errcode = 'PT400', hint = 'invalid_daily_limit';
  end if;

  if v_reset_hour not between 0 and 23 then
    raise exception '초기화 시각은 0시에서 23시 사이여야 합니다.'
      using errcode = 'PT400', hint = 'invalid_reset_hour';
  end if;

  -- 시간대에는 체크 제약이 없다. 여기서 막지 않으면 알 수 없는 식별자가 규칙에
  -- 들어앉아 그 뒤의 모든 경계 계산이 실패한다.
  begin
    perform now() at time zone v_time_zone;
  exception when others then
    raise exception '알 수 없는 시간대입니다.'
      using errcode = 'PT400', hint = 'invalid_time_zone';
  end;

  if v_limit = v_base.daily_limit_seconds
     and v_reset_hour = v_base.reset_hour
     and v_time_zone = v_base.time_zone then
    raise exception '현재 규칙과 같습니다.'
      using errcode = 'PT400', hint = 'no_change';
  end if;

  insert into public.rule_proposals (
    group_id, proposer_id, daily_limit_seconds, reset_hour, time_zone,
    base_version, expires_at
  ) values (
    v_group.id, v_actor, v_limit, v_reset_hour, v_time_zone,
    v_base.version, now() + interval '48 hours'
  )
  returning * into v_proposal;

  -- 동의가 필요한 명단을 여기서 고정한다.
  insert into public.rule_approvals (proposal_id, profile_id, decision, decided_at)
  select v_proposal.id, vid,
         -- 제안은 곧 동의다. 자기 변경안에 다시 한 번 누르게 할 이유가 없다.
         case when vid = v_actor then 'approved'::public.rule_decision
              else 'pending'::public.rule_decision end,
         case when vid = v_actor then now() else null end
    from public.rule_voter_ids(v_group.id) as vid;

  -- 혼자 남은 그룹이라면 이 순간 이미 전원 동의다.
  v_proposal := public.settle_rule_proposal(v_proposal.id);

  return public.rule_proposal_snapshot(v_proposal.id, v_actor);
end;
$$;

comment on function public.propose_rule_change is
  '규칙 변경안을 낸다. 넘기지 않은 값은 현재 값 그대로. 동의 명단은 이 시점에 고정된다.';

-- ============================================================================
-- respond_to_rule_proposal
-- ============================================================================

/** 변경안에 동의하거나 거절한다. 한 번 답하면 바꿀 수 없다. */
create or replace function public.respond_to_rule_proposal(
  target_proposal_id uuid,
  approve boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_proposal public.rule_proposals;
  v_approval public.rule_approvals;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if approve is null then
    raise exception '동의 여부가 필요합니다.'
      using errcode = 'PT400', hint = 'invalid_decision';
  end if;

  -- 멤버 확인이 판정보다 먼저다. settle은 상태를 바꾸는 함수이므로, 남의 그룹의
  -- 변경안 id를 찍어 보는 것만으로 그 그룹의 상태 전이를 촉발할 수 있으면 안 된다.
  select * into v_proposal
    from public.rule_proposals p
   where p.id = target_proposal_id;

  if not found then
    raise exception '변경안을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'proposal_not_found';
  end if;

  if not public.is_group_member(v_proposal.group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  -- 만료됐는지부터 확정한다. 48시간이 지난 변경안에 뒤늦게 동의해서 통과시키는
  -- 일이 없어야 한다.
  v_proposal := public.settle_rule_proposal(v_proposal.id);

  if v_proposal.status <> 'pending' then
    raise exception '이미 종료된 변경안입니다.'
      using errcode = 'PT409', hint = 'proposal_not_pending';
  end if;

  if not exists (
    select 1 from public.rule_voter_ids(v_proposal.group_id) as vid where vid = v_actor
  ) then
    raise exception '탈퇴를 예약한 상태에서는 규칙 변경에 참여할 수 없습니다.'
      using errcode = 'PT409', hint = 'member_leaving';
  end if;

  select * into v_approval
    from public.rule_approvals a
   where a.proposal_id = v_proposal.id
     and a.profile_id = v_actor;

  -- 변경안이 만들어진 뒤에 들어온 사람에게는 행이 없다. 동의 명단은 고정이므로
  -- 그 사람의 답은 결과를 바꾸지 않는다.
  if not found then
    raise exception '이 변경안의 동의 대상이 아닙니다.'
      using errcode = 'PT409', hint = 'not_required';
  end if;

  if v_approval.decision <> 'pending' then
    raise exception '이미 응답했습니다.'
      using errcode = 'PT409', hint = 'already_decided';
  end if;

  update public.rule_approvals
     set decision = case when approve then 'approved'::public.rule_decision
                         else 'rejected'::public.rule_decision end,
         decided_at = now()
   where id = v_approval.id;

  v_proposal := public.settle_rule_proposal(v_proposal.id);

  return public.rule_proposal_snapshot(v_proposal.id, v_actor);
end;
$$;

comment on function public.respond_to_rule_proposal is
  '변경안에 동의/거절한다. 마지막 한 명이 동의하면 그 자리에서 다음 오전 6시로 예약된다.';

-- ============================================================================
-- withdraw_rule_proposal
-- ============================================================================

/**
 * 진행 중인 변경안을 거둔다. 제안자 본인과 관리자만 할 수 있다.
 *
 * 관리자에게도 열어 두는 이유는 자리 하나 때문이다. 그룹당 pending은 하나뿐이라
 * 누군가 변경안을 내고 사라지면 48시간 동안 아무도 새 변경안을 낼 수 없다.
 */
create or replace function public.withdraw_rule_proposal(target_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_proposal public.rule_proposals;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  -- respond와 같은 순서. 판정은 이 변경안을 볼 자격을 확인한 뒤에 돈다.
  select * into v_proposal
    from public.rule_proposals p
   where p.id = target_proposal_id;

  if not found then
    raise exception '변경안을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'proposal_not_found';
  end if;

  if not public.is_group_member(v_proposal.group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  v_proposal := public.settle_rule_proposal(v_proposal.id);

  if v_proposal.proposer_id <> v_actor
     and not public.is_group_admin(v_proposal.group_id) then
    raise exception '변경안을 낸 사람이나 관리자만 거둘 수 있습니다.'
      using errcode = '42501', hint = 'not_allowed';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception '이미 종료된 변경안입니다.'
      using errcode = 'PT409', hint = 'proposal_not_pending';
  end if;

  update public.rule_proposals
     set status = 'withdrawn', resolved_at = now()
   where id = v_proposal.id;

  return public.rule_proposal_snapshot(v_proposal.id, v_actor);
end;
$$;

comment on function public.withdraw_rule_proposal is
  '진행 중인 변경안을 거둔다. 제안자 또는 관리자.';

-- ============================================================================
-- current_rule_proposal (읽기)
-- ============================================================================

/**
 * 그룹의 가장 최근 변경안 하나. 규칙 변경 화면이 여는 문이다.
 *
 * **stable이 아니라 volatile이다.** 읽기면서 상태를 바꾼다 — 만료 판정을 할
 * 주체가 이 스키마에 없으므로, 화면이 열릴 때가 판정하기 가장 자연스러운 순간이다.
 * 진행 중인 것이 없으면 최근에 끝난 것을 준다(방금 승인된 변경안의 적용 예정
 * 시각을 계속 보여줘야 한다). 한 번도 낸 적이 없으면 null.
 */
create or replace function public.current_rule_proposal(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pending_id uuid;
  v_latest_id uuid;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if not public.is_group_member(target_group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  select p.id into v_pending_id
    from public.rule_proposals p
   where p.group_id = target_group_id
     and p.status = 'pending';

  if found then
    perform public.settle_rule_proposal(v_pending_id);
  end if;

  select p.id into v_latest_id
    from public.rule_proposals p
   where p.group_id = target_group_id
   order by p.created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return public.rule_proposal_snapshot(v_latest_id, v_actor);
end;
$$;

comment on function public.current_rule_proposal is
  '그룹의 가장 최근 변경안. 조회하는 김에 만료·완성 판정을 함께 확정한다.';

-- ============================================================================
-- update_draft_rule
-- ============================================================================

/**
 * 시작 전 그룹의 규칙을 관리자가 바로 고친다.
 *
 * 버전을 쌓지 않고 1번 버전을 덮어쓴다. 0002가 버전을 쌓기로 한 것은 "어제의
 * 공동 한도가 얼마였는지"를 나중에도 알기 위해서인데, 시작하지 않은 그룹에는
 * 어제가 없다. 지나간 집계가 없으므로 남길 역사도 없다.
 */
create or replace function public.update_draft_rule(
  target_group_id uuid,
  new_daily_limit_seconds int default null,
  new_reset_hour int default null,
  new_time_zone text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_limit int;
  v_reset_hour int;
  v_time_zone text;
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

  if v_group.admin_id <> v_actor then
    raise exception '관리자만 할 수 있는 작업입니다.'
      using errcode = '42501', hint = 'not_admin';
  end if;

  -- 시작한 뒤에는 전원 동의를 거쳐야 한다.
  if v_group.status <> 'draft' then
    raise exception '시작한 그룹의 규칙은 전원 동의를 거쳐야 바꿀 수 있습니다.'
      using errcode = 'PT409', hint = 'group_already_started';
  end if;

  v_rule := public.latest_rule(v_group.id);

  if v_rule.id is null then
    raise exception '이 그룹에는 규칙이 없습니다.'
      using errcode = 'PT409', hint = 'rule_not_found';
  end if;

  v_limit := coalesce(new_daily_limit_seconds, v_rule.daily_limit_seconds);
  v_reset_hour := coalesce(new_reset_hour, v_rule.reset_hour);
  v_time_zone := coalesce(new_time_zone, v_rule.time_zone);

  if v_limit not between 600 and 86400 then
    raise exception '하루 공동 한도는 10분에서 24시간 사이여야 합니다.'
      using errcode = 'PT400', hint = 'invalid_daily_limit';
  end if;

  if v_reset_hour not between 0 and 23 then
    raise exception '초기화 시각은 0시에서 23시 사이여야 합니다.'
      using errcode = 'PT400', hint = 'invalid_reset_hour';
  end if;

  begin
    perform now() at time zone v_time_zone;
  exception when others then
    raise exception '알 수 없는 시간대입니다.'
      using errcode = 'PT400', hint = 'invalid_time_zone';
  end;

  update public.group_rules
     set daily_limit_seconds = v_limit,
         reset_hour = v_reset_hour,
         time_zone = v_time_zone,
         -- 새 값 기준의 직전 경계. create_group과 같은 규칙이라 즉시 유효하다.
         effective_from = public.frimit_period_start(now(), v_time_zone, v_reset_hour)
   where id = v_rule.id;

  update public.groups
     set time_zone = v_time_zone
   where id = v_group.id;

  return public.group_snapshot(v_group.id, v_actor);
end;
$$;

comment on function public.update_draft_rule is
  '시작 전 그룹의 규칙을 관리자가 즉시 수정한다. 시작한 그룹은 propose_rule_change를 쓴다.';

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.rule_proposals enable row level security;
alter table public.rule_approvals enable row level security;

-- 변경안과 승인 상태는 같은 그룹 멤버끼리 서로 본다. 누가 아직 안 눌렀는지가
-- 보여야 서로 챙길 수 있다(plan.md 84행 "멤버별 승인 상태").
create policy "멤버는 변경안 조회"
  on public.rule_proposals for select
  using (public.is_group_member(group_id));

create policy "멤버는 승인 상태 조회"
  on public.rule_approvals for select
  using (public.can_see_proposal(proposal_id));

-- insert/update/delete 정책은 두지 않는다. 쓰기는 RPC뿐이다.

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

grant select on table public.rule_proposals to authenticated;
grant select on table public.rule_approvals to authenticated;

-- 내부 헬퍼. can_see_proposal만 예외로 PUBLIC에 남긴다(정책이 쓴다).
revoke execute on function public.latest_rule(uuid) from public;
revoke execute on function public.rule_voter_ids(uuid) from public;
revoke execute on function public.rule_proposal_snapshot(uuid, uuid) from public;
revoke execute on function public.settle_rule_proposal(uuid) from public;

revoke execute on function public.propose_rule_change(uuid, int, int, text) from public;
grant execute on function public.propose_rule_change(uuid, int, int, text) to authenticated;

revoke execute on function public.respond_to_rule_proposal(uuid, boolean) from public;
grant execute on function public.respond_to_rule_proposal(uuid, boolean) to authenticated;

revoke execute on function public.withdraw_rule_proposal(uuid) from public;
grant execute on function public.withdraw_rule_proposal(uuid) to authenticated;

revoke execute on function public.current_rule_proposal(uuid) from public;
grant execute on function public.current_rule_proposal(uuid) to authenticated;

revoke execute on function public.update_draft_rule(uuid, int, int, text) from public;
grant execute on function public.update_draft_rule(uuid, int, int, text) to authenticated;
