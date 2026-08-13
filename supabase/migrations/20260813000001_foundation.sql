-- Frimit 기반 스키마: 시간 규칙, 프로필, 기기
--
-- 이 파일에서 가장 중요한 것은 테이블이 아니라 `frimit_period_start`다.
-- Frimit의 하루는 자정이 아니라 그룹 시간대의 오전 6시에 시작하고, 가입·탈퇴·
-- 규칙 변경·목표 시작이 전부 그 경계에 걸린다. 클라이언트(src/lib/frimit-day.ts)와
-- 서버가 같은 답을 내야 하므로 양쪽에 같은 규칙을 두고 각각 테스트한다.

-- ============================================================================
-- 시간 규칙
-- ============================================================================

/**
 * 주어진 순간이 속한 Frimit 일자의 시작(직전 오전 6시)을 돌려준다.
 *
 * 새벽 3시는 "어제"에 속한다. 아직 경계를 넘지 않았기 때문이다.
 *
 * STABLE인 이유: 시간대 규칙(tzdata)은 바뀔 수 있으므로 IMMUTABLE이 아니다.
 * 따라서 이 함수는 인덱스 식에 쓸 수 없고, 경계값은 계산해서 컬럼에 저장한다.
 */
create or replace function public.frimit_period_start(
  at_time timestamptz,
  time_zone text default 'Asia/Seoul',
  reset_hour int default 6
) returns timestamptz
language sql
stable
as $$
  select (
    case
      when extract(hour from local_ts) < reset_hour
        then date_trunc('day', local_ts) - interval '1 day'
      else date_trunc('day', local_ts)
    end + make_interval(hours => reset_hour)
  ) at time zone time_zone
  from (select at_time at time zone time_zone as local_ts) as s;
$$;

comment on function public.frimit_period_start is
  'Frimit 일자의 시작(그룹 시간대 오전 6시). 클라이언트의 periodStartFor와 동일한 규칙.';

/** 다음 경계. 가입·탈퇴·규칙 변경이 실제로 적용되는 시각이다. */
create or replace function public.frimit_next_period_start(
  at_time timestamptz,
  time_zone text default 'Asia/Seoul',
  reset_hour int default 6
) returns timestamptz
language sql
stable
as $$
  select public.frimit_period_start(at_time, time_zone, reset_hour)
       + interval '1 day';
$$;

/**
 * Frimit 일자 라벨. 오전 3시에도 전날 날짜가 나오는 것이 의도된 동작이다.
 * 일별 집계의 키로 쓴다.
 */
create or replace function public.frimit_date_key(
  at_time timestamptz,
  time_zone text default 'Asia/Seoul',
  reset_hour int default 6
) returns date
language sql
stable
as $$
  select (public.frimit_period_start(at_time, time_zone, reset_hour)
          at time zone time_zone)::date;
$$;

-- ============================================================================
-- 공통 트리거
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  nickname text not null
    constraint nickname_length check (char_length(trim(nickname)) between 1 and 20),

  -- 프리셋 아바타만 허용한다. 사용자 업로드 이미지는 MVP 범위 밖이고,
  -- 신고·검수 부담을 지지 않기 위한 결정이기도 하다.
  avatar_key text not null default 'avatar-01'
    constraint avatar_key_format check (avatar_key ~ '^avatar-[0-9]{2}$'),

  locale text not null default 'ko-KR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  '계정당 하나. auth.users가 지워지면 함께 지워진다.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- 프로필은 같은 그룹의 멤버끼리 서로 볼 수 있어야 한다.
-- 그 정책은 group_memberships가 생긴 뒤(0002)에 추가한다.
create policy "본인 프로필 조회"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "본인 프로필 생성"
  on public.profiles for insert
  with check (id = (select auth.uid()));

create policy "본인 프로필 수정"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

/** 로그인 직후 프로필이 없으면 만들어 준다. 닉네임은 온보딩에서 다시 받는다. */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    -- 온보딩에서 사용자가 직접 정하기 전까지 쓰는 임시값.
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), '친구')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- devices
-- ============================================================================

create type public.device_platform as enum ('ios', 'android');

create type public.permission_state as enum (
  'notDetermined',
  'granted',
  'denied',
  'restricted',
  'unavailable'
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,

  platform public.device_platform not null,

  -- 계정당 활성 집계 기기는 휴대폰 1대로 제한한다. 새 기기가 등록되면
  -- 이전 기기를 비활성화한다 (아래 트리거).
  is_active boolean not null default true,

  expo_push_token text,
  permission_state public.permission_state not null default 'notDetermined',
  last_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.devices.is_active is
  '계정당 하나만 true. 새 기기 등록 시 이전 기기가 자동으로 false가 된다.';

-- 계정당 활성 기기는 정확히 하나. 부분 유니크 인덱스로 DB가 직접 보장한다.
create unique index devices_one_active_per_profile
  on public.devices (profile_id)
  where is_active;

create index devices_profile_idx on public.devices (profile_id);

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

/**
 * 새 기기가 활성화되면 같은 계정의 다른 기기를 비활성화한다.
 *
 * 유니크 인덱스만으로는 "새 기기 등록이 실패"하게 되는데, 우리가 원하는 동작은
 * "새 기기가 이기고 이전 기기가 물러나는 것"이다.
 */
create or replace function public.deactivate_other_devices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    update public.devices
       set is_active = false
     where profile_id = new.profile_id
       and id <> new.id
       and is_active;
  end if;

  return new;
end;
$$;

create trigger devices_single_active
  before insert or update of is_active on public.devices
  for each row execute function public.deactivate_other_devices();

alter table public.devices enable row level security;

-- 기기 정보는 본인만 본다. 그룹에는 권한 상태와 마지막 동기화 시각만
-- tracking_status를 통해 공개된다 (0003).
create policy "본인 기기 조회"
  on public.devices for select
  using (profile_id = (select auth.uid()));

create policy "본인 기기 등록"
  on public.devices for insert
  with check (profile_id = (select auth.uid()));

create policy "본인 기기 수정"
  on public.devices for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "본인 기기 삭제"
  on public.devices for delete
  using (profile_id = (select auth.uid()));

-- ============================================================================
-- 권한 (GRANT)
--
-- 프로젝트에서 "Automatically expose new tables"를 껐기 때문에, API에 노출할
-- 테이블은 여기서 명시적으로 열어야 한다. 깜빡하면 안 열릴 뿐이고,
-- 반대로 깜빡해서 열리는 일은 없다 — 그게 이 설정을 끈 이유다.
--
-- RLS가 실제 접근 통제이고, GRANT는 "이 테이블이 API에 존재하는가"를 정한다.
-- 둘 다 통과해야 데이터가 나간다.
-- ============================================================================

grant usage on schema public to authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.devices to authenticated;

-- 시간 규칙 함수는 클라이언트도 계산에 쓸 수 있게 열어 둔다.
grant execute on function public.frimit_period_start(timestamptz, text, int) to authenticated;
grant execute on function public.frimit_next_period_start(timestamptz, text, int) to authenticated;
grant execute on function public.frimit_date_key(timestamptz, text, int) to authenticated;
