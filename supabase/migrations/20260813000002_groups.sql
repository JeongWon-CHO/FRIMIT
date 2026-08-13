-- 그룹, 멤버십, 공동 규칙
--
-- 이 스키마의 핵심은 **모든 변경이 즉시 적용되지 않는다**는 것이다.
-- 가입·탈퇴·규칙 변경은 전부 "다음 오전 6시부터 유효"하게 예약된다.
-- 그래서 멤버십과 규칙은 삭제·덮어쓰기가 아니라 유효기간(effective_from/until)으로 다룬다.
-- 진행 중인 하루의 공동 풀 계산이 도중에 흔들리면 안 되기 때문이다.

-- ============================================================================
-- groups
-- ============================================================================

create type public.group_status as enum (
  -- 초대·준비 중. 아직 집계하지 않는다.
  'draft',
  -- 관리자가 시작함. 공동 풀이 돌아간다.
  'active',
  -- 활성 멤버가 2명 미만이 되어 보관됨.
  'archived'
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),

  name text not null
    constraint group_name_length check (char_length(trim(name)) between 1 and 20),

  icon_key text not null default 'icon-01'
    constraint icon_key_format check (icon_key ~ '^icon-[0-9]{2}$'),
  color_key text not null default 'color-01'
    constraint color_key_format check (color_key ~ '^color-[0-9]{2}$'),

  admin_id uuid not null references public.profiles(id) on delete restrict,

  -- 그룹의 하루 경계는 이 시간대 기준이다. 멤버가 여행 중이어도 바뀌지 않는다.
  time_zone text not null default 'Asia/Seoul',

  status public.group_status not null default 'draft',

  -- 6자리 초대 코드. 활성 그룹 사이에서만 유일하면 된다.
  invite_code text not null
    constraint invite_code_format check (invite_code ~ '^[0-9]{6}$'),

  started_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 관리자는 탈퇴 전에 권한을 넘겨야 한다. 보관된 그룹은 예외.
  constraint started_groups_have_started_at
    check (status <> 'active' or started_at is not null)
);

comment on column public.groups.time_zone is
  '하루 경계(오전 6시)의 기준. 멤버 개인의 기기 시간대와 무관하게 그룹 값을 쓴다.';

-- 보관되지 않은 그룹끼리만 초대 코드가 유일하면 된다.
-- 보관된 그룹의 코드는 재사용할 수 있다.
create unique index groups_invite_code_active
  on public.groups (invite_code)
  where status <> 'archived';

create index groups_admin_idx on public.groups (admin_id);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

/** 아직 쓰이지 않는 6자리 초대 코드를 만든다. */
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts int := 0;
begin
  loop
    -- 000000~999999. 앞자리 0도 유효한 코드다.
    candidate := lpad((floor(random() * 1000000))::int::text, 6, '0');

    exit when not exists (
      select 1 from public.groups
       where invite_code = candidate
         and status <> 'archived'
    );

    attempts := attempts + 1;
    if attempts > 50 then
      raise exception '초대 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    end if;
  end loop;

  return candidate;
end;
$$;

-- ============================================================================
-- group_memberships
-- ============================================================================

create type public.group_role as enum ('admin', 'member');

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  role public.group_role not null default 'member',

  -- 권한과 추적 대상 선택을 마쳤는가. 준비된 멤버가 2명 이상이어야 시작할 수 있다.
  is_ready boolean not null default false,

  -- 집계에 실제로 포함되기 시작하는 시각. 그룹 시작 전 가입자는 그룹 시작 시각,
  -- 시작 후 가입자는 다음 오전 6시다.
  effective_from timestamptz,

  -- 탈퇴가 반영되는 시각(다음 오전 6시). null이면 아직 탈퇴하지 않았다.
  effective_until timestamptz,

  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint one_membership_per_group unique (group_id, profile_id)
);

comment on column public.group_memberships.effective_from is
  '이 시각부터 공동 풀 계산에 포함된다. 가입 즉시가 아니라 다음 오전 6시인 경우가 많다.';
comment on column public.group_memberships.effective_until is
  '탈퇴 예약 시각. 그 전까지는 여전히 집계에 포함된다.';

create index memberships_group_idx on public.group_memberships (group_id);
create index memberships_profile_idx on public.group_memberships (profile_id);

create trigger memberships_set_updated_at
  before update on public.group_memberships
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS 헬퍼
--
-- group_memberships의 정책이 group_memberships를 다시 조회하면 무한 재귀가 된다.
-- security definer 함수로 RLS를 우회해 한 단계 끊어 준다.
-- ============================================================================

/** 로그인한 사용자가 이 그룹에 속해 있는가 (탈퇴 예정이어도 그 시각 전까지는 true). */
create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.group_memberships m
     where m.group_id = target_group_id
       and m.profile_id = (select auth.uid())
       and (m.effective_until is null or m.effective_until > now())
  );
$$;

/** 로그인한 사용자가 이 그룹의 관리자인가. */
create or replace function public.is_group_admin(target_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.groups g
     where g.id = target_group_id
       and g.admin_id = (select auth.uid())
  );
$$;

/**
 * 특정 시점에 집계에 포함되는 멤버.
 * 공동 풀 계산과 목표 진행률이 모두 이 정의를 쓴다.
 */
create or replace function public.active_member_ids(
  target_group_id uuid,
  at_time timestamptz default now()
) returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.profile_id
    from public.group_memberships m
   where m.group_id = target_group_id
     and m.effective_from is not null
     and m.effective_from <= at_time
     and (m.effective_until is null or m.effective_until > at_time);
$$;

-- ============================================================================
-- group_rules
--
-- 규칙은 덮어쓰지 않고 버전을 쌓는다. 어제의 공동 한도가 얼마였는지를
-- 나중에도 정확히 알 수 있어야 지난 기록을 다시 그릴 수 있다.
-- ============================================================================

create table public.group_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,

  -- 그룹 전체가 하루에 함께 쓰는 시간. 개인 한도가 아니다.
  daily_limit_seconds int not null
    constraint daily_limit_range check (daily_limit_seconds between 600 and 86400),

  reset_hour int not null default 6
    constraint reset_hour_range check (reset_hour between 0 and 23),

  time_zone text not null default 'Asia/Seoul',

  version int not null default 1,

  -- 이 규칙이 유효해지는 시각(오전 6시 경계).
  effective_from timestamptz not null,

  created_at timestamptz not null default now(),

  constraint one_version_per_group unique (group_id, version)
);

comment on table public.group_rules is
  '규칙은 버전으로 쌓인다. 특정 시각의 규칙은 effective_from <= t 중 가장 최신 것.';

create index group_rules_lookup_idx
  on public.group_rules (group_id, effective_from desc);

/** 특정 시각에 유효한 규칙. */
create or replace function public.effective_rule(
  target_group_id uuid,
  at_time timestamptz default now()
) returns public.group_rules
language sql
security definer
stable
set search_path = ''
as $$
  select r.*
    from public.group_rules r
   where r.group_id = target_group_id
     and r.effective_from <= at_time
   order by r.effective_from desc, r.version desc
   limit 1;
$$;

-- ============================================================================
-- RLS 정책
-- ============================================================================

alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_rules enable row level security;

-- 그룹: 멤버만 본다. 초대 코드로 가입하는 경로는 RPC(security definer)로 처리하므로
-- 비멤버에게 그룹을 열어 줄 필요가 없다.
create policy "멤버는 그룹 조회"
  on public.groups for select
  using (public.is_group_member(id));

create policy "관리자는 그룹 수정"
  on public.groups for update
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

-- 멤버십: 같은 그룹 멤버끼리 서로 보인다.
create policy "같은 그룹 멤버십 조회"
  on public.group_memberships for select
  using (public.is_group_member(group_id));

-- 탈퇴는 본인만. 단 관리자는 권한 이전 후에만 나갈 수 있다(RPC에서 검사).
create policy "본인 멤버십 수정"
  on public.group_memberships for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- 규칙: 멤버는 읽기만. 변경은 전원 동의 절차(0004)를 거쳐 RPC로만 쓴다.
create policy "멤버는 규칙 조회"
  on public.group_rules for select
  using (public.is_group_member(group_id));

/**
 * 로그인한 사용자와 대상이 그룹을 하나라도 공유하는가.
 *
 * 정책 안에서 group_memberships를 직접 조회하면 그 테이블의 RLS가 또 평가되어
 * 정책 안에서 정책이 도는 구조가 된다. 프로필 조회는 목록마다 일어나는 흔한
 * 경로라 여기서 한 단계 끊는다.
 */
create or replace function public.shares_group_with(target_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.group_memberships mine
      join public.group_memberships theirs
        on theirs.group_id = mine.group_id
     where mine.profile_id = (select auth.uid())
       and theirs.profile_id = target_profile_id
  );
$$;

-- 프로필: 같은 그룹 멤버의 닉네임·아바타는 서로 보여야 한다.
-- 0001에서 미뤄 둔 정책을 여기서 추가한다.
create policy "같은 그룹 멤버 프로필 조회"
  on public.profiles for select
  using (public.shares_group_with(id));

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

-- 그룹 생성·가입·시작은 전부 RPC(security definer)로 처리한다.
-- 초대 코드 검증, 최대 그룹 수, 최대 인원 같은 규칙을 클라이언트가 우회할 수
-- 없어야 하므로 insert 권한은 주지 않는다.
grant select, update on table public.groups to authenticated;
grant select, update on table public.group_memberships to authenticated;

-- 규칙은 읽기 전용. 변경은 전원 동의 절차를 거쳐 RPC로만 쓴다.
grant select on table public.group_rules to authenticated;
