-- 사용량 스냅샷과 일일 확정 집계
--
-- 기기가 올리는 것은 "구간 시작부터 지금까지 몇 초"라는 누적값 하나뿐이다.
-- 앱 이름도, 패키지명도, iOS 선택 토큰도 올라오지 않는다(plan.md의 프라이버시 계약).
-- 서버가 하는 일은 그 값을 **깎이지 않게** 모으고, 기간과 자격을 검증하는 것이다.
--
--
-- ## 두 층으로 나눈 이유
--
-- - usage_snapshots: 기기가 보낸 원본. 같은 값이 여러 번 와도 한 번만 남는다. 7일 보관.
-- - daily_member_usage: 서버가 확정한 멤버별 일일 누적값. 90일 보관.
--
-- 원본을 남기는 이유는 재계산과 사후 조사 때문이다. 누적값이 뒷걸음질치거나
-- 기기 시각이 튀었을 때, 확정값만 있으면 무엇이 잘못됐는지 알 방법이 없다.
-- 반대로 확정값을 따로 두는 이유는 읽기 경로 때문이다. 오늘 화면은 그룹의 합계를
-- 초 단위로 자주 읽는데, 매번 원본을 훑을 수는 없다.
--
--
-- ## 멱등성 (plan.md 122행)
--
-- 멱등 키는 `device + group + period + sequence`다. 네트워크가 끊겨 같은 스냅샷을
-- 두 번 보내도, 앱이 재시도를 반복해도 결과가 같아야 한다. sequence는 기기가
-- (device, group, period) 안에서 단조 증가시키는 값이다.
--
--
-- ## 누적값은 줄어들지 않는다 (plan.md 123행)
--
-- 확정값은 `greatest(기존, 새 값)`으로만 움직인다. iOS의 계단값은 임계값 콜백이
-- 늦게 도착하면 순서가 뒤집힐 수 있고, Android는 재부팅 직후 0부터 다시 세는
-- 구간이 있다. 어느 쪽이든 사용자에게 "쓴 시간이 줄어드는" 화면을 보여줄 수는 없다.
--
--
-- ## 집계 대상 판정 — 시점이 아니라 **겹침**이다
--
-- 기존 `active_member_ids(group, at_time)`는 어느 한 순간의 활성 멤버를 준다.
-- 그런데 그룹은 하루 중간에 시작될 수 있고(plan.md 34행 "시작 시점부터 첫 오전
-- 6시까지도 공동 한도 전체를 제공"), 그 경우 멤버들의 effective_from은 구간 시작이
-- 아니라 구간 **중간**이다. 시점 기준으로 구간 시작에서 판정하면 시작 당일의
-- 사용량이 통째로 버려진다.
--
-- 그래서 이 파일은 [effective_from, effective_until)과 [period_start, period_end)의
-- **겹침**으로 판정한다. 탈퇴를 예약한 멤버(effective_until = 다음 오전 6시)는
-- 그 구간까지는 여전히 포함된다 — 오늘의 공동 풀을 실제로 쓰고 있기 때문이다.
--
--
-- ## 쓰기 경로
--
-- 0004와 같은 원칙이다. 클라이언트에는 집계 테이블의 insert/update 권한을 주지
-- 않는다(plan.md 125행). 스냅샷은 record_usage_snapshot(s) RPC로만 들어오고,
-- daily_member_usage는 그 안에서만 갱신된다. 읽기는 RLS로 열어 두어 Realtime이
-- 그룹 합계를 그대로 실어 나를 수 있게 한다.

-- ============================================================================
-- usage_snapshots
-- ============================================================================

-- 클라이언트 계약(modules/screen-time)의 UsageSource와 문자열이 정확히 같아야 한다.
create type public.usage_source as enum ('ios-device-activity', 'android-usage-stats');

create table public.usage_snapshots (
  id uuid primary key default gen_random_uuid(),

  device_id uuid not null references public.devices(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  -- devices.profile_id의 사본. 기기가 지워져도 누가 올렸는지는 남아야 하고,
  -- 조회할 때마다 devices를 거치지 않아도 되게 한다.
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- 집계 구간의 시작(그룹 시간대의 오전 6시). 반드시 경계값이어야 한다.
  period_start timestamptz not null,

  cumulative_seconds int not null
    constraint cumulative_seconds_range check (cumulative_seconds between 0 and 90000),

  collected_at timestamptz not null,
  permission_state public.permission_state not null,
  source public.usage_source not null,

  -- (device, group, period) 안에서 단조 증가하는 순번.
  sequence bigint not null
    constraint sequence_non_negative check (sequence >= 0),

  created_at timestamptz not null default now(),

  -- plan.md 122행의 멱등 키 그대로.
  constraint one_snapshot_per_sequence
    unique (device_id, group_id, period_start, sequence)
);

comment on table public.usage_snapshots is
  '기기가 보낸 원본 스냅샷. 7일 후 삭제한다. 확정값은 daily_member_usage에 있다.';
comment on column public.usage_snapshots.cumulative_seconds is
  '구간 시작부터의 누적 사용 초. 상한 90000은 서머타임으로 25시간이 되는 날을 위한 여유다.';

create index usage_snapshots_group_period_idx
  on public.usage_snapshots (group_id, period_start);
create index usage_snapshots_purge_idx
  on public.usage_snapshots (period_start);

-- ============================================================================
-- daily_member_usage
-- ============================================================================

create table public.daily_member_usage (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  period_start timestamptz not null,
  -- 화면과 최근 7일 기록의 키. frimit_date_key는 STABLE이라 생성 컬럼으로 쓸 수
  -- 없으므로(tzdata가 바뀔 수 있다) 쓰는 시점에 계산해 넣는다.
  date_key date not null,

  -- 지금까지 관측된 최대값. 절대 줄어들지 않는다.
  cumulative_seconds int not null default 0
    constraint confirmed_seconds_range check (cumulative_seconds between 0 and 90000),

  -- 마지막으로 값을 갱신한 스냅샷의 정보. "언제까지의 값인가"를 화면에 보여준다.
  last_collected_at timestamptz not null,
  last_sequence bigint not null,
  source public.usage_source not null,
  permission_state public.permission_state not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint one_row_per_member_period unique (group_id, profile_id, period_start)
);

comment on table public.daily_member_usage is
  '서버가 확정한 멤버별 일일 누적값. 그룹 합계는 이 표를 더해서 만든다. 90일 보관.';
comment on column public.daily_member_usage.cumulative_seconds is
  '최대 관측값. 늦게 도착한 낮은 값은 무시한다(plan.md 123행).';

create index daily_member_usage_group_period_idx
  on public.daily_member_usage (group_id, period_start);
create index daily_member_usage_profile_idx
  on public.daily_member_usage (profile_id, date_key desc);

create trigger daily_member_usage_set_updated_at
  before update on public.daily_member_usage
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 구간과 멤버 판정
-- ============================================================================

/**
 * 어떤 구간에 **걸쳐 있던** 멤버들. 집계 대상 판정은 전부 이 함수를 쓴다.
 *
 * `active_member_ids`는 한 순간의 활성 멤버를 주는 함수라, 하루 중간에 시작한
 * 그룹의 첫날을 통째로 놓친다. 여기서는 유효기간과 구간이 겹치기만 하면 포함한다.
 */
create or replace function public.period_member_ids(
  target_group_id uuid,
  period_start timestamptz,
  period_end timestamptz
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
     and m.effective_from < period_end
     and (m.effective_until is null or m.effective_until > period_start);
$$;

comment on function public.period_member_ids is
  '구간과 유효기간이 겹치는 멤버. 하루 중간에 시작한 그룹의 첫날을 놓치지 않는다.';

-- ============================================================================
-- record_usage_snapshot
-- ============================================================================

/**
 * 기기가 보낸 스냅샷 하나를 받아 확정값까지 갱신한다.
 *
 * 검증 순서는 "싼 것부터, 그리고 거절 사유가 분명한 것부터"다. 기기 소유권 →
 * 그룹 상태 → 구간의 정당성 → 멤버 자격. 마지막 둘은 서버 시간과 그룹 규칙만
 * 보고 판단한다(plan.md 121행). 기기가 보낸 period_start를 그대로 믿지 않는다.
 *
 * 돌려주는 status:
 *   recorded  — 확정값이 올라갔다
 *   stale     — 받아서 원본으로는 남겼지만 확정값보다 낮아 채택하지 않았다
 *   duplicate — 같은 (device, group, period, sequence)가 이미 있었다
 */
create or replace function public.record_usage_snapshot(
  target_device_id uuid,
  target_group_id uuid,
  period_start timestamptz,
  cumulative_seconds int,
  collected_at timestamptz,
  permission_state public.permission_state,
  source public.usage_source,
  sequence bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_device public.devices;
  v_group public.groups;
  v_rule public.group_rules;
  v_time_zone text;
  v_reset_hour int;
  v_period_end timestamptz;
  v_inserted boolean := false;
  v_confirmed int;
  v_status text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if cumulative_seconds is null or cumulative_seconds < 0 then
    raise exception '누적 사용 시간이 올바르지 않습니다.'
      using errcode = 'PT400', hint = 'invalid_cumulative_seconds';
  end if;

  select * into v_device
    from public.devices d
   where d.id = target_device_id
     and d.profile_id = v_actor;

  if not found then
    raise exception '등록되지 않은 기기입니다.'
      using errcode = 'PT404', hint = 'device_not_found';
  end if;

  -- 계정당 활성 집계 기기는 하나뿐이다(plan.md 27행). 물러난 기기가 뒤늦게
  -- 올리는 값을 받으면 두 기기의 사용량이 섞인다.
  if not v_device.is_active then
    raise exception '비활성 기기의 사용량은 받지 않습니다.'
      using errcode = 'PT409', hint = 'device_inactive';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  -- draft는 아직 집계하지 않고, archived는 더 이상 집계하지 않는다.
  if v_group.status <> 'active' then
    raise exception '집계 중인 그룹이 아닙니다.'
      using errcode = 'PT409', hint = 'group_not_collecting';
  end if;

  -- 그 구간에 유효했던 규칙으로 경계를 따진다. 규칙이 바뀌어도 지난 구간의
  -- 경계는 그때의 규칙대로 남아야 한다.
  v_rule := public.effective_rule(v_group.id, period_start);
  v_time_zone := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset_hour := coalesce(v_rule.reset_hour, 6);
  v_period_end := public.frimit_next_period_start(period_start, v_time_zone, v_reset_hour);

  -- 기기가 보낸 값이 진짜 경계인가. 임의의 시각을 보내 구간을 쪼개지 못하게 한다.
  if period_start is distinct from
     public.frimit_period_start(period_start, v_time_zone, v_reset_hour) then
    raise exception '집계 구간의 시작이 올바르지 않습니다.'
      using errcode = 'PT400', hint = 'invalid_period_start';
  end if;

  if period_start > now() then
    raise exception '아직 오지 않은 구간입니다.'
      using errcode = 'PT400', hint = 'future_period';
  end if;

  -- 원본 보관 기간을 넘긴 구간은 받아도 곧 지워진다. 받지 않는 편이 정직하다.
  if period_start < now() - interval '7 days' then
    raise exception '너무 오래된 구간입니다.'
      using errcode = 'PT409', hint = 'period_too_old';
  end if;

  -- 그 구간에 이 사람이 그룹에 걸쳐 있었는가.
  if not exists (
    select 1 from public.period_member_ids(v_group.id, period_start, v_period_end) as pid
     where pid = v_actor
  ) then
    raise exception '그 기간에는 이 그룹의 집계 대상이 아닙니다.'
      using errcode = 'PT409', hint = 'not_in_period';
  end if;

  -- 원본. 같은 순번이 다시 오면 조용히 넘어간다(plan.md 122행).
  insert into public.usage_snapshots (
    device_id, group_id, profile_id, period_start,
    cumulative_seconds, collected_at, permission_state, source, sequence
  ) values (
    target_device_id, v_group.id, v_actor, period_start,
    cumulative_seconds, collected_at, permission_state, source, sequence
  )
  on conflict on constraint one_snapshot_per_sequence do nothing;

  v_inserted := found;

  -- 확정값은 위로만 움직인다.
  insert into public.daily_member_usage (
    group_id, profile_id, period_start, date_key, cumulative_seconds,
    last_collected_at, last_sequence, source, permission_state
  ) values (
    v_group.id, v_actor, period_start,
    public.frimit_date_key(period_start, v_time_zone, v_reset_hour),
    cumulative_seconds, collected_at, sequence, source, permission_state
  )
  on conflict on constraint one_row_per_member_period do update
    -- 기존 행은 테이블 이름으로만 가리킨다. 스키마까지 붙이면 ON CONFLICT의
    -- 범위 항목과 이름이 어긋날 수 있다.
    set cumulative_seconds = greatest(
          daily_member_usage.cumulative_seconds,
          excluded.cumulative_seconds
        ),
        -- 아래 값들은 "가장 최근에 들은 소식"이므로 채택 여부와 무관하게 갱신한다.
        last_collected_at = greatest(
          daily_member_usage.last_collected_at,
          excluded.last_collected_at
        ),
        last_sequence = greatest(
          daily_member_usage.last_sequence,
          excluded.last_sequence
        ),
        source = excluded.source,
        permission_state = excluded.permission_state
  returning cumulative_seconds into v_confirmed;

  v_status := case
    when not v_inserted then 'duplicate'
    when v_confirmed > cumulative_seconds then 'stale'
    else 'recorded'
  end;

  -- 기기가 마지막으로 동기화한 시각과 권한 상태를 함께 갱신한다.
  -- MY 화면과 그룹 상세의 "동기화 불가" 표시가 이 값을 읽는다.
  update public.devices
     set last_synced_at = greatest(coalesce(last_synced_at, collected_at), collected_at),
         permission_state = record_usage_snapshot.permission_state
   where id = target_device_id;

  return jsonb_build_object(
    'status', v_status,
    'group_id', v_group.id,
    'period_start', period_start,
    'confirmed_seconds', v_confirmed,
    'accepted_seconds', cumulative_seconds
  );
end;
$$;

comment on function public.record_usage_snapshot is
  '스냅샷 하나를 멱등하게 기록하고 확정값을 최대값으로 갱신한다.';

-- ============================================================================
-- record_usage_snapshots (묶음)
-- ============================================================================

/**
 * 여러 그룹의 스냅샷을 한 번에 올린다.
 *
 * 기기는 그룹별로 따로 재는 게 아니라 한 번에 전부 읽어 온다
 * (ScreenTime.getAllSnapshots). 그룹마다 왕복하면 이동 통신에서 그만큼 실패
 * 지점이 늘어난다.
 *
 * **한 건이 실패해도 나머지는 살린다.** 그룹 하나가 보관됐다는 이유로 다른 네
 * 그룹의 사용량까지 버려지면, 사용자는 이유를 알 수 없는 채로 시간을 잃는다.
 * 실패한 건은 결과 배열에 사유가 담긴다.
 */
create or replace function public.record_usage_snapshots(snapshots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_hint text;
  v_message text;
begin
  if jsonb_typeof(snapshots) <> 'array' then
    raise exception '스냅샷 목록이 배열이 아닙니다.'
      using errcode = 'PT400', hint = 'invalid_payload';
  end if;

  for v_item in select * from jsonb_array_elements(snapshots)
  loop
    begin
      v_one := public.record_usage_snapshot(
        (v_item ->> 'device_id')::uuid,
        (v_item ->> 'group_id')::uuid,
        (v_item ->> 'period_start')::timestamptz,
        (v_item ->> 'cumulative_seconds')::int,
        (v_item ->> 'collected_at')::timestamptz,
        (v_item ->> 'permission_state')::public.permission_state,
        (v_item ->> 'source')::public.usage_source,
        (v_item ->> 'sequence')::bigint
      );
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint, v_message = message_text;
      v_one := jsonb_build_object(
        'status', 'rejected',
        'group_id', v_item ->> 'group_id',
        'hint', coalesce(v_hint, 'unknown'),
        'message', v_message
      );
    end;

    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return v_results;
end;
$$;

comment on function public.record_usage_snapshots is
  '스냅샷 묶음을 기록한다. 한 건이 실패해도 나머지는 기록되고, 실패 사유가 결과에 담긴다.';

-- ============================================================================
-- group_daily_usage (읽기)
-- ============================================================================

/**
 * 그룹의 오늘(또는 지정한 시각이 속한 구간) 공동 풀 상태.
 *
 * 잔여시간 = 공동 한도 - 활성 멤버 누적 사용량(plan.md 19행). 한도를 넘겨도
 * 차단하지 않고 초과분을 계속 센다(20행). 그래서 remaining은 0에서 멈추고
 * over가 따로 올라간다.
 */
create or replace function public.group_daily_usage(
  target_group_id uuid,
  at_time timestamptz default now()
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_group public.groups;
  v_rule public.group_rules;
  v_time_zone text;
  v_reset_hour int;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit int;
  v_total int;
  v_members jsonb;
begin
  if (select auth.uid()) is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  -- security definer라 RLS를 우회한다. 멤버 여부를 직접 확인해야 한다.
  if not public.is_group_member(target_group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  select * into v_group from public.groups g where g.id = target_group_id;

  v_rule := public.effective_rule(v_group.id, at_time);
  v_time_zone := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset_hour := coalesce(v_rule.reset_hour, 6);
  v_limit := v_rule.daily_limit_seconds;

  v_period_start := public.frimit_period_start(at_time, v_time_zone, v_reset_hour);
  v_period_end := public.frimit_next_period_start(at_time, v_time_zone, v_reset_hour);

  -- 집계 대상 전원이 한 줄씩 나온다. 아직 한 번도 올리지 않은 사람은 0으로.
  select
      coalesce(sum(u.cumulative_seconds), 0)::int,
      -- 아직 한 번도 올리지 않은 멤버도 0으로 한 줄을 차지한다. 화면에서
      -- "아직 동기화 안 됨"과 "0초 썼음"을 구분해야 하므로 시각은 null로 둔다.
      coalesce(jsonb_agg(jsonb_build_object(
        'profile_id', pid,
        'cumulative_seconds', coalesce(u.cumulative_seconds, 0),
        'last_collected_at', u.last_collected_at,
        'permission_state', u.permission_state
      ) order by u.cumulative_seconds desc nulls last), '[]'::jsonb)
    into v_total, v_members
    from public.period_member_ids(v_group.id, v_period_start, v_period_end) as pid
    left join lateral (
      select d.cumulative_seconds, d.last_collected_at, d.permission_state
        from public.daily_member_usage d
       where d.group_id = v_group.id
         and d.profile_id = pid
         and d.period_start = v_period_start
    ) u on true;

  v_total := coalesce(v_total, 0);

  return jsonb_build_object(
    'group_id', v_group.id,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'date_key', public.frimit_date_key(at_time, v_time_zone, v_reset_hour),
    'daily_limit_seconds', v_limit,
    'total_seconds', v_total,
    'remaining_seconds', greatest(v_limit - v_total, 0),
    'over_seconds', greatest(v_total - v_limit, 0),
    'member_count', jsonb_array_length(v_members),
    'members', v_members
  );
end;
$$;

comment on function public.group_daily_usage is
  '그룹의 현재 구간 공동 풀 상태. 한도를 넘으면 remaining은 0에서 멈추고 over가 오른다.';

-- ============================================================================
-- 보관 기간 (plan.md 126행)
-- ============================================================================

/**
 * 원본 스냅샷 7일, 확정 집계 90일. 예약 작업이 주기적으로 부른다.
 * 지운 행 수를 돌려주므로 작업 로그에 그대로 남길 수 있다.
 */
create or replace function public.purge_expired_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshots int;
  v_daily int;
begin
  delete from public.usage_snapshots
   where period_start < now() - interval '7 days';
  get diagnostics v_snapshots = row_count;

  delete from public.daily_member_usage
   where period_start < now() - interval '90 days';
  get diagnostics v_daily = row_count;

  return jsonb_build_object(
    'deleted_snapshots', v_snapshots,
    'deleted_daily_rows', v_daily
  );
end;
$$;

comment on function public.purge_expired_usage is
  '보관 기간이 지난 사용량을 지운다. 예약 작업 전용(service_role).';

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.usage_snapshots enable row level security;
alter table public.daily_member_usage enable row level security;

-- 원본은 본인 것만. 다른 멤버에게 필요한 것은 확정된 합계뿐이다.
create policy "본인 스냅샷 조회"
  on public.usage_snapshots for select
  using (profile_id = (select auth.uid()));

-- 확정값은 같은 그룹 멤버끼리 본다. 공동 풀이 곧 이 표의 합이므로
-- 서로 얼마나 썼는지가 제품의 핵심이다(plan.md 82행 "멤버별 총 사용시간").
create policy "멤버는 그룹 집계 조회"
  on public.daily_member_usage for select
  using (public.is_group_member(group_id));

-- insert/update/delete 정책은 두지 않는다. 쓰기는 RPC뿐이다.

-- ============================================================================
-- Realtime
--
-- 오늘 화면의 공동 게이지는 남이 쓴 시간에 따라 움직여야 한다(plan.md 124행).
-- 확정값 표만 배포하면 클라이언트가 합계를 다시 계산할 수 있다. 원본 스냅샷은
-- 배포하지 않는다 — 남에게 보일 이유가 없다.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.daily_member_usage;
  end if;
end;
$$;

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

-- 읽기만 연다. 집계값을 클라이언트가 직접 쓰지 못하게 하는 것이 이 설계의 전제다.
grant select on table public.usage_snapshots to authenticated;
grant select on table public.daily_member_usage to authenticated;

revoke execute on function public.period_member_ids(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.purge_expired_usage() from public;

revoke execute on function public.record_usage_snapshot(
  uuid, uuid, timestamptz, int, timestamptz,
  public.permission_state, public.usage_source, bigint
) from public;
grant execute on function public.record_usage_snapshot(
  uuid, uuid, timestamptz, int, timestamptz,
  public.permission_state, public.usage_source, bigint
) to authenticated;

revoke execute on function public.record_usage_snapshots(jsonb) from public;
grant execute on function public.record_usage_snapshots(jsonb) to authenticated;

revoke execute on function public.group_daily_usage(uuid, timestamptz) from public;
grant execute on function public.group_daily_usage(uuid, timestamptz) to authenticated;
