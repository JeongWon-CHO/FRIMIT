-- 공동 목표 (goals / goal_participants / goal_entries)
--
-- plan.md 42~50행이 정한 것은 여섯 문장이다.
--   · 그룹당 활성 목표는 1개
--   · 기간은 7·14·30일 중 선택하며 다음 오전 6시에 시작
--   · 모든 참여자에게 동일한 개인 목표량과 사용자 정의 단위
--   · 그룹 진행률은 개인 달성률을 100%로 제한한 뒤 평균
--   · 목표 시작 시점의 멤버를 참여자로 고정, 중간 가입자는 다음 목표부터
--   · 기록은 해당 Frimit 일자 안에서 수정·삭제 가능
--
--
-- ## 스케줄러가 여기에도 필요 없다
--
-- 0005가 규칙 변경을 "미래 시각의 행을 미리 넣어 두는" 방식으로 풀었다. 목표도
-- 같다 — `starts_at`(다음 오전 6시)과 `ends_at`을 만들 때 확정해 두면, 시작도
-- 종료도 시각 비교만으로 관측된다. 'scheduled → active → completed' 같은 상태
-- 컬럼을 두면 그것을 옮겨 줄 주체가 다시 필요해지고, 이 스키마에는 그런 주체가
-- 없다.
--
-- 그래서 상태는 세 값에서 파생된다: `cancelled_at is null and now() < ends_at`이면
-- 살아 있는 목표, 그중 `starts_at <= now()`면 진행 중.
--
--
-- ## 참여자를 만들 때 고정하는 이유
--
-- plan.md는 "목표 **시작 시점**의 멤버"라고 했는데 목표는 만들어진 뒤 다음 오전
-- 6시에 시작한다. 그 둘 사이에 명단을 물어볼 사람이 없다 — 그런데 물어볼 필요도
-- 없다. 가입·탈퇴도 같은 경계에 걸리므로 `active_member_ids(group, starts_at)`는
-- 지금 계산해도 그때의 명단과 같은 답을 준다. 미래 시각을 넣어 지금 세는 것이
-- 이 스키마가 예약을 다루는 방식이고, 0005가 동의 명단을 고정한 것과도 같다.
--
-- 그 사이에 누가 새로 가입하면? 그 사람의 `effective_from`은 **그다음** 오전
-- 6시라 명단에 잡히지 않는다. plan.md의 "중간 가입자는 다음 목표부터"가 별도
-- 분기 없이 그대로 나온다.
--
--
-- ## 하루에 한 줄
--
-- `goal_entries`는 (목표, 사람, 날짜)로 유일하다. plan.md가 요구한 것은 "그날의
-- 진행량"이지 기록 목록이 아니고, 한 줄로 두면 '수정'이 그냥 같은 호출의 덮어
-- 쓰기가 된다. 여러 줄을 허용하면 화면에 목록·개별 편집·합산이 전부 따라오는데,
-- 그것들이 벌어 주는 것은 "오후에 두 번 나눠 적기"뿐이다.
--
-- 날짜는 시각이 아니라 **Frimit 일자 라벨**로 잡는다. 자정이 아니라 오전 6시가
-- 경계이므로 새벽 2시의 기록은 어제 몫이고, 그 판정은 `frimit_date_key` 하나에만
-- 있어야 한다.
--
--
-- ## 아직 없는 것
--
-- plan.md 49행은 "모든 변경은 활동 내역에 남긴다"고 했다. `activity_events`가
-- 아직 없으므로 그 절반은 여기 없다 — 기록·수정·삭제는 일어나되 흔적이 남지
-- 않는다. 활동 피드를 만들 때 이 세 RPC에 이벤트 생성 한 줄씩을 더하면 된다.
--
--
-- ## 잠금
--
-- 0004·0005의 순서를 이어받아 **groups → goals**로 잡는다. 목표 id만 들고 들어오는
-- 경로(기록·삭제·취소)도 그룹 행을 먼저 잡는다.

-- ============================================================================
-- 표
-- ============================================================================

create table public.goals (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,

  title text not null
    constraint goal_title_length check (char_length(trim(title)) between 1 and 30),

  -- 개인 목표량. 참여자 전원에게 같은 값이다(plan.md 45행) — 그래서 참여자 행이
  -- 아니라 목표에 붙는다.
  target_amount numeric(10, 2) not null
    constraint goal_target_positive check (target_amount > 0),

  -- 사용자 정의 단위. "번", "km", "쪽". 서버는 해석하지 않고 길이만 본다.
  unit text not null
    constraint goal_unit_length check (char_length(trim(unit)) between 1 and 8),

  duration_days int not null
    constraint goal_duration_choices check (duration_days in (7, 14, 30)),

  -- 만들 때 확정한다. 시작은 다음 오전 6시, 끝은 그로부터 기간만큼 뒤의 오전 6시.
  starts_at timestamptz not null,
  ends_at timestamptz not null,

  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goal_ends_after_start check (ends_at > starts_at)
);

comment on table public.goals is
  '그룹당 살아 있는 목표는 하나. 상태 컬럼 없이 starts_at/ends_at/cancelled_at에서 파생된다.';
comment on column public.goals.target_amount is
  '개인 목표량. 그룹 진행률은 이 값에 대한 개인 달성률을 100%에서 끊어 평균한 것이다.';

create index goals_group_idx on public.goals (group_id, ends_at desc);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create table public.goal_participants (
  id uuid primary key default gen_random_uuid(),

  goal_id uuid not null references public.goals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint one_participation_per_goal unique (goal_id, profile_id)
);

comment on table public.goal_participants is
  '목표 시작 시점의 멤버 명단. 만들 때 고정되며 도중에 늘지도 줄지도 않는다.';

create index goal_participants_goal_idx on public.goal_participants (goal_id);

create table public.goal_entries (
  id uuid primary key default gen_random_uuid(),

  goal_id uuid not null references public.goals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,

  amount numeric(10, 2) not null
    constraint goal_entry_positive check (amount > 0),

  -- 짧은 메모. 사진 인증도 승인도 없다(plan.md 50행) — 한 줄이면 충분하다.
  note text
    constraint goal_note_length check (note is null or char_length(note) <= 40),

  -- 기록이 속한 Frimit 일자. 자정이 아니라 오전 6시 경계로 잘린 값이다.
  date_key date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint one_entry_per_day unique (goal_id, profile_id, date_key)
);

comment on column public.goal_entries.date_key is
  'frimit_date_key로 자른 날짜. 새벽 2시의 기록은 어제 몫이다.';

create index goal_entries_goal_idx on public.goal_entries (goal_id, profile_id);

create trigger goal_entries_set_updated_at
  before update on public.goal_entries
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 헬퍼
-- ============================================================================

/**
 * 이 목표를 볼 수 있는가. goal_participants·goal_entries의 조회 정책이 쓴다.
 *
 * 0005의 `can_see_proposal`과 같은 이유로 security definer다. PUBLIC에서 회수하지
 * 않는 것도 같다 — 정책은 조회하는 롤의 권한으로 평가된다.
 */
create or replace function public.can_see_goal(target_goal_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.goals g
     where g.id = target_goal_id
       and public.is_group_member(g.group_id)
  );
$$;

/**
 * 그룹의 살아 있는 목표. 취소되지 않았고 아직 끝나지 않은 것.
 *
 * 시작 전(예약됨)도 여기 포함된다. 그래야 "그룹당 하나" 검사가 내일 시작할
 * 목표를 세고, 화면도 "내일 6시에 시작해요"를 그릴 수 있다.
 */
create or replace function public.live_goal(target_group_id uuid)
returns public.goals
language sql
security definer
stable
set search_path = ''
as $$
  select g.*
    from public.goals g
   where g.group_id = target_group_id
     and g.cancelled_at is null
     and g.ends_at > now()
   order by g.created_at desc
   limit 1;
$$;

/**
 * 목표 RPC의 공통 응답.
 *
 * 진행률을 여기서 한 번만 계산한다. 개인 달성률을 100%에서 끊고(`least(…, 1)`)
 * 그다음 평균 — 순서를 바꾸면 한 사람이 열 배를 해서 나머지의 0을 메우게 되고,
 * 그건 이 제품이 원하는 그림이 아니다(plan.md 46행).
 *
 * `days_left`는 싣지 않는다. 클라이언트가 `ends_at` 하나로 계산하고 그 함수만
 * 테스트한다 — 서버와 화면 양쪽에 같은 산수를 두면 언젠가 갈라진다.
 */
create or replace function public.goal_snapshot(
  target_goal_id uuid,
  viewer_id uuid
) returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  with goal as (
    select * from public.goals where id = target_goal_id
  ),
  today as (
    select public.frimit_date_key(
             now(),
             coalesce(r.time_zone, gr.time_zone),
             coalesce(r.reset_hour, 6)
           ) as date_key
      from goal g
      join public.groups gr on gr.id = g.group_id
      left join lateral public.effective_rule(gr.id, now()) r on true
  ),
  member_rows as (
    select
        p.profile_id,
        pr.nickname,
        pr.avatar_key,
        coalesce(sum(e.amount), 0) as amount,
        least(coalesce(sum(e.amount), 0) / g.target_amount, 1) as ratio
      from goal g
      join public.goal_participants p on p.goal_id = g.id
      left join public.profiles pr on pr.id = p.profile_id
      left join public.goal_entries e
        on e.goal_id = g.id and e.profile_id = p.profile_id
     group by p.profile_id, pr.nickname, pr.avatar_key, g.target_amount
  )
  select jsonb_build_object(
    'goal', jsonb_build_object(
      'id', g.id,
      'group_id', g.group_id,
      'title', g.title,
      'target_amount', g.target_amount,
      'unit', g.unit,
      'duration_days', g.duration_days,
      'starts_at', g.starts_at,
      'ends_at', g.ends_at,
      'cancelled_at', g.cancelled_at,
      'created_by', g.created_by
    ),
    'group_name', gr.name,
    'date_key', t.date_key,
    -- 시작 전 목표는 진행률이 아니라 "언제 시작하는가"를 보여줘야 한다.
    'started', g.starts_at <= now(),
    'group_progress', coalesce((select round(avg(ratio), 4) from member_rows), 0),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profile_id', profile_id,
               -- 계정 삭제 직후의 빈 프로필도 행을 유지한다. 평균의 분모가
               -- 사람이 지워졌다고 줄어들면 남은 사람들의 진행률이 튄다.
               'nickname', coalesce(nickname, '탈퇴한 멤버'),
               'avatar_key', coalesce(avatar_key, 'avatar-01'),
               'amount', amount,
               'ratio', round(ratio, 4)
             ) order by ratio desc, nickname)
        from member_rows
    ), '[]'::jsonb),
    -- 오늘 내가 적은 것. 화면의 입력칸이 이 값으로 채워지고, 있으면 '수정'이 된다.
    'my_entry', (
      select case when e.id is null then null else jsonb_build_object(
        'amount', e.amount,
        'note', e.note,
        'date_key', e.date_key
      ) end
        from public.goal_entries e
       where e.goal_id = g.id
         and e.profile_id = viewer_id
         and e.date_key = t.date_key
    )
  )
    from goal g
    join public.groups gr on gr.id = g.group_id
    cross join today t;
$$;

comment on function public.goal_snapshot is
  '목표 RPC의 공통 응답. security definer라 RLS를 우회하므로 클라이언트에 노출하지 않는다.';

-- ============================================================================
-- create_goal
-- ============================================================================

/**
 * 공동 목표를 만든다. 시작은 다음 오전 6시다.
 *
 * 인자 이름이 `goal_title`·`goal_unit`인 이유는 0004와 같다 — 컬럼과 같은 이름을
 * 쓰면 plpgsql이 컬럼으로 해석해 조건이 조용히 무너진다.
 *
 * 기간을 더할 때 `starts_at + interval`을 쓰지 않는다. UTC 기준으로 24시간씩
 * 더하면 서머타임이 있는 시간대에서 목표가 오전 5시나 7시에 끝난다. 그룹 시간대의
 * 벽시계로 날짜를 더한 뒤 다시 순간으로 돌려야 항상 오전 6시에 끝난다.
 */
create or replace function public.create_goal(
  target_group_id uuid,
  goal_title text,
  target_amount numeric,
  goal_unit text,
  duration_days int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_time_zone text;
  v_reset_hour int;
  v_starts timestamptz;
  v_ends timestamptz;
  v_goal public.goals;
  v_participants int;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if duration_days not in (7, 14, 30) then
    raise exception '기간은 7일·14일·30일 중에서 고를 수 있습니다.'
      using errcode = 'PT400', hint = 'invalid_duration';
  end if;

  if target_amount is null or target_amount <= 0 then
    raise exception '목표량은 0보다 커야 합니다.'
      using errcode = 'PT400', hint = 'invalid_target_amount';
  end if;

  if coalesce(trim(goal_title), '') = '' then
    raise exception '목표 이름을 적어 주세요.'
      using errcode = 'PT400', hint = 'invalid_title';
  end if;

  if coalesce(trim(goal_unit), '') = '' then
    raise exception '단위를 적어 주세요.'
      using errcode = 'PT400', hint = 'invalid_unit';
  end if;

  select * into v_group
    from public.groups g
   where g.id = target_group_id
     for no key update;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'group_not_found';
  end if;

  -- security definer라 RLS를 우회한다. 멤버 여부를 직접 확인해야 한다.
  if not public.is_group_member(v_group.id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  -- 시작하지 않은 그룹에는 참여자가 없다(`active_member_ids`가 비어 있다).
  -- 명단이 빈 목표를 만들어 두면 아무도 기록할 수 없는 채로 30일이 지난다.
  if v_group.status <> 'active' then
    raise exception '시작한 그룹에서만 목표를 만들 수 있습니다.'
      using errcode = 'PT409', hint = 'group_not_active';
  end if;

  v_rule := public.effective_rule(v_group.id, now());
  v_time_zone := coalesce(v_rule.time_zone, v_group.time_zone);
  v_reset_hour := coalesce(v_rule.reset_hour, 6);

  v_starts := public.frimit_next_period_start(now(), v_time_zone, v_reset_hour);
  v_ends := ((v_starts at time zone v_time_zone) + make_interval(days => duration_days))
            at time zone v_time_zone;

  -- 그룹당 하나. 두 개가 동시에 돌면 "우리 목표"라는 말이 무엇을 가리키는지
  -- 화면에서도 대화에서도 사라진다. 그룹 행을 잡고 있으므로 이 검사와 아래의
  -- insert 사이에 다른 세션이 끼어들 수 없다.
  -- `live_goal(...) is not null`로 쓰면 안 된다. 복합 타입의 IS NOT NULL은
  -- "모든 필드가 not null"이라는 뜻이라, cancelled_at이 null인 살아 있는 목표에서
  -- 거짓이 된다. 필드 하나를 꺼내 본다.
  if (public.live_goal(v_group.id)).id is not null then
    raise exception '이미 진행 중인 목표가 있습니다.'
      using errcode = 'PT409', hint = 'goal_already_exists';
  end if;

  insert into public.goals (
    group_id, created_by, title, target_amount, unit, duration_days, starts_at, ends_at
  ) values (
    v_group.id, v_actor, trim(goal_title), target_amount, trim(goal_unit),
    duration_days, v_starts, v_ends
  )
  returning * into v_goal;

  -- 명단은 여기서 고정된다. `v_starts` 기준으로 세는 것이 핵심이다 — 오늘 가입해
  -- 내일 6시부터 반영되는 사람은 목표가 시작할 때 이미 멤버이므로 함께 시작한다.
  insert into public.goal_participants (goal_id, profile_id)
  select v_goal.id, pid
    from public.active_member_ids(v_group.id, v_starts) as pid;

  get diagnostics v_participants = row_count;

  if v_participants = 0 then
    raise exception '목표를 시작할 멤버가 없습니다.'
      using errcode = 'PT409', hint = 'no_participants';
  end if;

  return public.goal_snapshot(v_goal.id, v_actor);
end;
$$;

-- ============================================================================
-- 기록
-- ============================================================================

/**
 * 오늘 몫을 적는다. 같은 날 다시 부르면 덮어쓴다 — 그것이 '수정'이다.
 *
 * 어제 것은 고칠 수 없다(plan.md 49행). 날짜를 인자로 받지 않는 것이 그 규칙의
 * 전부다 — 서버가 지금 시각으로 날짜를 정하므로 클라이언트가 지난 날짜를 지목할
 * 방법 자체가 없다.
 */
create or replace function public.record_goal_entry(
  target_goal_id uuid,
  entry_amount numeric,
  entry_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group_id uuid;
  v_goal public.goals;
  v_group public.groups;
  v_rule public.group_rules;
  v_date_key date;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if entry_amount is null or entry_amount <= 0 then
    raise exception '기록은 0보다 커야 합니다.'
      using errcode = 'PT400', hint = 'invalid_amount';
  end if;

  if char_length(coalesce(entry_note, '')) > 40 then
    raise exception '메모는 40자까지 적을 수 있습니다.'
      using errcode = 'PT400', hint = 'note_too_long';
  end if;

  -- 잠금 순서: groups → goals. 목표 id만 들고 들어와도 그룹을 먼저 잡는다.
  -- 그래서 그룹 id만 먼저 읽고, 목표 행은 그룹을 잠근 뒤에 다시 읽는다 — 순서를
  -- 바꾸면 그사이에 들어온 취소를 못 보고 기록을 받는다.
  select g.group_id into v_group_id from public.goals g where g.id = target_goal_id;

  if not found then
    raise exception '목표를 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'goal_not_found';
  end if;

  select * into v_group
    from public.groups gr
   where gr.id = v_group_id
     for no key update;

  select g.* into v_goal
    from public.goals g
   where g.id = target_goal_id
     for no key update;

  if not exists (
    select 1 from public.goal_participants p
     where p.goal_id = v_goal.id and p.profile_id = v_actor
  ) then
    raise exception '이 목표의 참여자가 아닙니다.'
      using errcode = 'PT403', hint = 'not_a_participant';
  end if;

  if v_goal.cancelled_at is not null then
    raise exception '취소된 목표입니다.'
      using errcode = 'PT409', hint = 'goal_cancelled';
  end if;

  if now() < v_goal.starts_at then
    raise exception '아직 시작하지 않은 목표입니다.'
      using errcode = 'PT409', hint = 'goal_not_started';
  end if;

  if now() >= v_goal.ends_at then
    raise exception '이미 끝난 목표입니다.'
      using errcode = 'PT409', hint = 'goal_ended';
  end if;

  v_rule := public.effective_rule(v_group.id, now());
  v_date_key := public.frimit_date_key(
    now(),
    coalesce(v_rule.time_zone, v_group.time_zone),
    coalesce(v_rule.reset_hour, 6)
  );

  insert into public.goal_entries (goal_id, profile_id, amount, note, date_key)
  values (v_goal.id, v_actor, entry_amount, nullif(trim(coalesce(entry_note, '')), ''), v_date_key)
  on conflict (goal_id, profile_id, date_key) do update
    set amount = excluded.amount,
        note = excluded.note;

  return public.goal_snapshot(v_goal.id, v_actor);
end;
$$;

/** 오늘 적은 것을 지운다. 어제 것은 지울 수 없다 — 날짜를 받지 않는 이유가 같다. */
create or replace function public.delete_goal_entry(target_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group_id uuid;
  v_goal public.goals;
  v_group public.groups;
  v_rule public.group_rules;
  v_date_key date;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  select g.group_id into v_group_id from public.goals g where g.id = target_goal_id;

  if not found then
    raise exception '목표를 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'goal_not_found';
  end if;

  select * into v_group
    from public.groups gr
   where gr.id = v_group_id
     for no key update;

  select g.* into v_goal
    from public.goals g
   where g.id = target_goal_id
     for no key update;

  v_rule := public.effective_rule(v_group.id, now());
  v_date_key := public.frimit_date_key(
    now(),
    coalesce(v_rule.time_zone, v_group.time_zone),
    coalesce(v_rule.reset_hour, 6)
  );

  delete from public.goal_entries e
   where e.goal_id = v_goal.id
     and e.profile_id = v_actor
     and e.date_key = v_date_key;

  return public.goal_snapshot(v_goal.id, v_actor);
end;
$$;

-- ============================================================================
-- cancel_goal
--
-- plan.md에 없다. 0005가 거절(reject)을 더한 것과 같은 이유로 넣는다 — 그룹당
-- 목표가 하나뿐이라, 단위를 잘못 적은 30일짜리 목표 하나가 그룹의 목표 자리를
-- 한 달 동안 막는다. 되돌릴 방법 없는 상한은 상한이 아니라 사고다.
--
-- 전원 동의를 요구하지 않는 것은 목표가 규칙과 달리 공동 풀 계산에 끼어들지
-- 않기 때문이다. 잃는 것은 기록뿐이고, 그래서 만든 사람과 관리자로 좁힌다.
-- ============================================================================

create or replace function public.cancel_goal(target_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group_id uuid;
  v_goal public.goals;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  select g.group_id into v_group_id from public.goals g where g.id = target_goal_id;

  if not found then
    raise exception '목표를 찾을 수 없습니다.'
      using errcode = 'PT404', hint = 'goal_not_found';
  end if;

  perform 1 from public.groups gr where gr.id = v_group_id for no key update;

  select g.* into v_goal
    from public.goals g
   where g.id = target_goal_id
     for no key update;

  if v_goal.created_by <> v_actor and not public.is_group_admin(v_goal.group_id) then
    raise exception '목표를 만든 사람이나 관리자만 취소할 수 있습니다.'
      using errcode = 'PT403', hint = 'not_goal_owner';
  end if;

  if v_goal.cancelled_at is null then
    update public.goals set cancelled_at = now() where id = v_goal.id;
  end if;

  return public.goal_snapshot(v_goal.id, v_actor);
end;
$$;

-- ============================================================================
-- 조회
-- ============================================================================

/** 그룹의 살아 있는 목표. 없으면 null. 화면은 그룹마다 이걸 한 번씩 부른다. */
create or replace function public.current_goal(target_group_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_goal public.goals;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  if not public.is_group_member(target_group_id) then
    raise exception '참여 중인 그룹이 아닙니다.'
      using errcode = 'PT404', hint = 'not_a_member';
  end if;

  v_goal := public.live_goal(target_group_id);
  if v_goal.id is null then return null; end if;

  return public.goal_snapshot(v_goal.id, v_actor);
end;
$$;

-- ============================================================================
-- RLS
--
-- 쓰기는 전부 위의 RPC를 거친다. 목표량·참여자 명단·남의 기록을 클라이언트가
-- 직접 건드릴 수 있으면 이 화면의 숫자는 아무 의미가 없다.
-- ============================================================================

alter table public.goals enable row level security;
alter table public.goal_participants enable row level security;
alter table public.goal_entries enable row level security;

create policy "멤버는 목표 조회"
  on public.goals for select
  using (public.is_group_member(group_id));

create policy "멤버는 참여자 조회"
  on public.goal_participants for select
  using (public.can_see_goal(goal_id));

create policy "멤버는 기록 조회"
  on public.goal_entries for select
  using (public.can_see_goal(goal_id));

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

grant select on table public.goals to authenticated;
grant select on table public.goal_participants to authenticated;
grant select on table public.goal_entries to authenticated;

-- 내부 헬퍼. can_see_goal만 PUBLIC에 남긴다(정책이 쓴다).
revoke execute on function public.live_goal(uuid) from public;
revoke execute on function public.goal_snapshot(uuid, uuid) from public;

revoke execute on function public.create_goal(uuid, text, numeric, text, int) from public;
grant execute on function public.create_goal(uuid, text, numeric, text, int) to authenticated;

revoke execute on function public.record_goal_entry(uuid, numeric, text) from public;
grant execute on function public.record_goal_entry(uuid, numeric, text) to authenticated;

revoke execute on function public.delete_goal_entry(uuid) from public;
grant execute on function public.delete_goal_entry(uuid) to authenticated;

revoke execute on function public.cancel_goal(uuid) from public;
grant execute on function public.cancel_goal(uuid) to authenticated;

revoke execute on function public.current_goal(uuid) from public;
grant execute on function public.current_goal(uuid) to authenticated;
