-- 활동 내역 (activity_events)
--
-- plan.md가 활동 탭에 요구한 것은 다섯 가지다(78행) — 한도 단계 도달, 초과,
-- 목표 기록, 멤버 변경, 규칙 변경. 반응과 콕 찌르기는 이 표 위에 얹히지만
-- 푸시까지 딸려 오므로 여기서는 만들지 않는다.
--
--
-- ## RPC가 아니라 트리거인 이유
--
-- 사건을 만드는 자리가 이미 열 곳쯤 된다 — 0004의 그룹 수명주기 RPC, 0005의
-- 규칙 승인, 0006(goals)의 기록, 그리고 사용량 확정. 각 함수에 insert 한 줄씩을
-- 더하려면 이미 검증을 마친 함수 여덟 개를 통째로 다시 선언해야 하고, 앞으로
-- 새로 생기는 쓰기 경로마다 사람이 기억해서 한 줄을 더해야 한다.
--
-- **표에 트리거를 걸면 그 둘이 모두 사라진다.** 사건은 "행이 이렇게 바뀌었다"는
-- 사실 그 자체이므로, 그 사실이 기록되는 자리에서 만드는 것이 맞다. 기존 파일은
-- 한 글자도 건드리지 않는다.
--
--
-- ## 문장은 여기서 만들지 않는다
--
-- 행에는 `kind`와 재료(payload)만 담는다. "지호가 3번 기록했어요" 같은 문장은
-- 화면이 만든다(src/lib/activity-view.ts). 문구를 서버에 넣으면 카피를 고칠 때마다
-- 마이그레이션이 필요하고, 이미 저장된 옛 문장은 고쳐지지도 않는다.
--
-- payload에는 **사용 내역이 들어가지 않는다.** 앱 이름과 패키지명은 애초에 서버에
-- 없고(0005의 프라이버시 계약), 여기에도 초 단위 합계와 목표 숫자만 온다.
--
--
-- ## 하루 한 번
--
-- plan.md 25행: "75%, 90%, 100% 도달 시 **그룹당 하루 한 번씩**". 스냅샷은 몇 분마다
-- 올라오므로 조건만 보면 같은 사건이 하루 종일 반복된다. `dedupe_key`와 부분 유니크
-- 인덱스가 그것을 데이터베이스에서 막는다 — 트리거가 `on conflict do nothing`으로
-- 넣고, 두 번째부터는 조용히 버려진다.
--
-- 목표 기록처럼 여러 번 일어나도 되는 사건은 `dedupe_key`가 null이라 이 인덱스에
-- 걸리지 않는다.

-- ============================================================================
-- 표
-- ============================================================================

create type public.activity_kind as enum (
  -- 그룹
  'group_started',
  'member_joined',
  'member_left',
  'rule_changed',
  -- 공동 풀
  'pool_threshold',
  'pool_over',
  -- 목표
  'goal_created',
  'goal_entry',
  'goal_cleared',
  'goal_cancelled'
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.groups(id) on delete cascade,

  -- 사람이 한 일이 아닌 사건도 있다(한도 도달, 규칙 적용). 그때는 null이다.
  -- 계정이 지워져도 사건 자체는 남아야 하므로 set null.
  actor_id uuid references public.profiles(id) on delete set null,

  kind public.activity_kind not null,

  -- 문장을 만들 재료. 숫자와 제목뿐이다.
  payload jsonb not null default '{}'::jsonb,

  -- 하루에 한 번만 생겨야 하는 사건의 키. 그 외에는 null.
  dedupe_key text,
  date_key date,

  created_at timestamptz not null default now()
);

comment on table public.activity_events is
  '그룹 통합 활동 흐름. 90일 보관. 문장이 아니라 재료를 담는다.';
comment on column public.activity_events.dedupe_key is
  '한도 단계처럼 하루 한 번만 생겨야 하는 사건의 키. null이면 몇 번이든 생긴다.';

create unique index activity_events_once_per_day
  on public.activity_events (group_id, date_key, dedupe_key)
  where dedupe_key is not null;

create index activity_events_feed_idx
  on public.activity_events (group_id, created_at desc);

create index activity_events_purge_idx
  on public.activity_events (created_at);

-- ============================================================================
-- 사건 기록 헬퍼
-- ============================================================================

/**
 * 사건 한 줄. 트리거들이 전부 이것만 부른다.
 *
 * `on conflict do nothing`이 여기 있는 이유: 하루 한 번 규칙을 지키는 자리가
 * 트리거마다 흩어지면 언젠가 한 곳이 빠진다.
 */
create or replace function public.log_activity(
  target_group_id uuid,
  actor uuid,
  event_kind public.activity_kind,
  event_payload jsonb default '{}'::jsonb,
  once_key text default null,
  on_date date default null
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_events (group_id, actor_id, kind, payload, dedupe_key, date_key)
  values (target_group_id, actor, event_kind, coalesce(event_payload, '{}'::jsonb), once_key, on_date)
  on conflict do nothing;
$$;

-- ============================================================================
-- 그룹 트리거
-- ============================================================================

/**
 * 가입과 탈퇴.
 *
 * 관리자의 첫 멤버십은 건너뛴다. 그 행은 `create_group`이 만드는 것이고,
 * "내가 만든 그룹에 내가 들어왔어요"는 사건이 아니다. 관리자 이전은 role을
 * update하지 insert하지 않으므로 이 조건에 걸리지 않는다.
 */
create or replace function public.log_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'admin' then
      return null;
    end if;
    perform public.log_activity(new.group_id, new.profile_id, 'member_joined');

  -- 탈퇴는 삭제가 아니라 예약이다(0004). null → 값으로 바뀌는 순간이 그 사건이다.
  elsif old.effective_until is null and new.effective_until is not null then
    perform public.log_activity(
      new.group_id, new.profile_id, 'member_left',
      jsonb_build_object('effective_until', new.effective_until)
    );
  end if;

  return null;
end;
$$;

create trigger group_memberships_log_activity
  after insert or update on public.group_memberships
  for each row execute function public.log_membership_change();

/** 그룹 시작. draft → active 한 번뿐이다. */
create or replace function public.log_group_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'active' then
    perform public.log_activity(new.id, new.admin_id, 'group_started');
  end if;
  return null;
end;
$$;

create trigger groups_log_activity
  after update on public.groups
  for each row execute function public.log_group_started();

/**
 * 규칙 변경이 예약됐다.
 *
 * 1번 버전은 그룹을 만들 때 함께 생기므로 사건이 아니다. 2번부터가 전원 동의를
 * 거쳐 온 것이거나(0005) 시작 전 그룹의 관리자 수정이다.
 *
 * 주인은 없다. 전원이 동의해서 만들어진 규칙에 한 사람의 이름을 붙이면 그 사람이
 * 정한 것처럼 읽힌다.
 */
create or replace function public.log_rule_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version > 1 then
    perform public.log_activity(
      new.group_id, null, 'rule_changed',
      jsonb_build_object(
        'daily_limit_seconds', new.daily_limit_seconds,
        'effective_from', new.effective_from,
        'version', new.version
      )
    );
  end if;
  return null;
end;
$$;

create trigger group_rules_log_activity
  after insert on public.group_rules
  for each row execute function public.log_rule_version();

-- ============================================================================
-- 공동 풀 트리거
-- ============================================================================

/**
 * 한도 단계 도달과 초과.
 *
 * 확정값이 갱신되는 자리에 건다. 스냅샷 원본이 아니라 `daily_member_usage`인
 * 이유는, 뒤늦게 도착한 낮은 값이 채택되지 않은 경우까지 사건을 만들면 안 되기
 * 때문이다 — 이 표가 움직였다는 것은 그룹의 합계가 실제로 올라갔다는 뜻이다.
 *
 * 합계는 그 구간의 집계 대상 전원(`period_member_ids`)을 더해서 낸다. 방금 들어온
 * 행 하나만 보면 "나 혼자 75%"가 되어 버린다.
 *
 * 한도가 없는 상태(시작 전 그룹 등)에서는 아무 사건도 만들지 않는다.
 */
create or replace function public.log_pool_thresholds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.group_rules;
  v_period_end timestamptz;
  v_total int;
  v_limit int;
  v_ratio numeric;
  v_step int;
begin
  v_rule := public.effective_rule(new.group_id, new.period_start);
  v_limit := v_rule.daily_limit_seconds;

  if v_limit is null or v_limit <= 0 then
    return null;
  end if;

  v_period_end := new.period_start + interval '1 day';

  select coalesce(sum(d.cumulative_seconds), 0)::int
    into v_total
    from public.period_member_ids(new.group_id, new.period_start, v_period_end) as pid
    join public.daily_member_usage d
      on d.group_id = new.group_id
     and d.profile_id = pid
     and d.period_start = new.period_start;

  v_ratio := v_total::numeric / v_limit;

  -- 세 단계를 낮은 것부터 훑는다. 한 번의 갱신이 두 단계를 한꺼번에 넘길 수 있고
  -- (계단값이 성기게 올라오므로 흔하다), 그때는 두 줄이 다 남는 것이 맞다.
  foreach v_step in array array[75, 90, 100] loop
    if v_ratio * 100 >= v_step then
      perform public.log_activity(
        new.group_id, null, 'pool_threshold',
        jsonb_build_object(
          'threshold', v_step,
          'total_seconds', v_total,
          'limit_seconds', v_limit
        ),
        'pool:' || v_step,
        new.date_key
      );
    end if;
  end loop;

  -- 한도에 정확히 닿은 것과 넘긴 것은 다른 사건이다. 넘겨도 차단하지 않으므로
  -- (plan.md 24행) 초과분은 계속 쌓이지만, 알리는 것은 하루 한 번이다.
  if v_total > v_limit then
    perform public.log_activity(
      new.group_id, null, 'pool_over',
      jsonb_build_object(
        'over_seconds', v_total - v_limit,
        'total_seconds', v_total,
        'limit_seconds', v_limit
      ),
      'pool:over',
      new.date_key
    );
  end if;

  return null;
end;
$$;

create trigger daily_member_usage_log_activity
  after insert or update on public.daily_member_usage
  for each row execute function public.log_pool_thresholds();

-- ============================================================================
-- 목표 트리거
-- ============================================================================

/** 목표를 만들고 그만두는 일. */
create or replace function public.log_goal_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.group_id, new.created_by, 'goal_created',
      jsonb_build_object(
        'title', new.title,
        'target_amount', new.target_amount,
        'unit', new.unit,
        'duration_days', new.duration_days,
        'starts_at', new.starts_at
      )
    );
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    perform public.log_activity(
      new.group_id, null, 'goal_cancelled',
      jsonb_build_object('title', new.title)
    );
  end if;

  return null;
end;
$$;

create trigger goals_log_activity
  after insert or update on public.goals
  for each row execute function public.log_goal_lifecycle();

/**
 * 진행 기록.
 *
 * plan.md 49행이 요구한 "모든 변경은 활동 내역에 남는다"가 여기다. 하루 한 줄을
 * 덮어쓰는 구조라 insert와 update가 사용자에게는 똑같이 '오늘 기록'이고, 그래서
 * 같은 kind로 남긴다. 지운 것만 다르게 부른다.
 */
create or replace function public.log_goal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.goal_entries;
  v_goal public.goals;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select * into v_goal from public.goals g where g.id = v_row.goal_id;

  if not found then
    -- 목표가 통째로 지워지는 중이면(cascade) 남길 사건이 없다.
    return null;
  end if;

  perform public.log_activity(
    v_goal.group_id,
    v_row.profile_id,
    (case when tg_op = 'DELETE' then 'goal_cleared' else 'goal_entry' end)::public.activity_kind,
    jsonb_build_object(
      'title', v_goal.title,
      'unit', v_goal.unit,
      'amount', v_row.amount,
      'target_amount', v_goal.target_amount
    )
  );

  return null;
end;
$$;

create trigger goal_entries_log_activity
  after insert or update or delete on public.goal_entries
  for each row execute function public.log_goal_entry();

-- ============================================================================
-- 보관 기간
-- ============================================================================

/**
 * 90일이 지난 활동 내역을 지운다(plan.md 127행).
 *
 * `purge_expired_usage`와 나란한 함수다. 예약 작업이 아직 없으므로, 그것을 붙일
 * 때 둘 다 부르면 된다. 하나로 합치지 않은 것은 이름이 하는 일과 달라지기 때문이다.
 */
create or replace function public.purge_expired_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.activity_events
   where created_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('deleted_events', v_deleted);
end;
$$;

comment on function public.purge_expired_activity is
  '보관 기간이 지난 활동 내역을 지운다. 예약 작업 전용(service_role).';

-- ============================================================================
-- RLS
--
-- 읽기만 연다. 쓰기 경로는 트리거뿐이고, 트리거는 security definer라 이 정책과
-- 무관하게 넣는다. 클라이언트가 사건을 지어내거나 지울 수 있으면 활동 내역은
-- 아무것도 증명하지 못한다.
-- ============================================================================

alter table public.activity_events enable row level security;

create policy "멤버는 활동 조회"
  on public.activity_events for select
  using (public.is_group_member(group_id));

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

grant select on table public.activity_events to authenticated;

revoke execute on function public.log_activity(uuid, uuid, public.activity_kind, jsonb, text, date) from public;
revoke execute on function public.purge_expired_activity() from public;
