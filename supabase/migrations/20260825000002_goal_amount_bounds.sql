-- 목표 금액 검사를 컬럼과 같은 눈금으로
--
-- 0008은 목표량과 기록을 `numeric(10, 2)` 컬럼에 넣으면서, 검사는 **반올림 전
-- 값**으로 했다. 그 사이로 두 가지가 샜다.
--
--   목표량 0.004      → RPC의 `> 0` 통과 → 컬럼에서 0.00 → goal_target_positive 위반
--   목표량 1000000000 → RPC 통과 → numeric field overflow
--
-- 둘 다 사용자에게 이렇게 보였다:
--
--   목표를 만들지 못했습니다: new row for relation "goals" violates check
--   constraint "goal_target_positive"
--   목표를 만들지 못했습니다: numeric field overflow
--
-- 화면이 오류를 예쁘게 감싸는 것으로는 못 고친다. 저 문장에는 hint 슬러그가 없고,
-- 무엇을 어떻게 고쳐야 하는지도 들어 있지 않다. 검사가 **컬럼과 같은 눈금**을
-- 봐야 한다 — `round(x, 2)`가 0.01에서 99999999.99 사이인가.
--
-- `between`을 쓰는 데는 이유가 하나 더 있다. numeric은 'NaN'을 값으로 갖고,
-- Postgres에서 `NaN > 0`은 **참**이다. 부등호로 검사하면 크래프팅된 요청이 NaN을
-- 밀어 넣어 테이블 제약까지 통과시키고, 그 뒤로 진행률이 전부 NaN이 된다.
-- `between`은 NaN에 대해 거짓이라 그 길이 막힌다.
--
-- 두 함수의 나머지 부분은 0008 그대로다. 바뀐 것은 각각의 검사 한 덩어리뿐이다.

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

  if target_amount is null or not (round(target_amount, 2) between 0.01 and 99999999.99) then
    raise exception '목표량은 0.01에서 99999999.99 사이여야 합니다.'
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

  if entry_amount is null or not (round(entry_amount, 2) between 0.01 and 99999999.99) then
    raise exception '기록은 0.01에서 99999999.99 사이여야 합니다.'
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
