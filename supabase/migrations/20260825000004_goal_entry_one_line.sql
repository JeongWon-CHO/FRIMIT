-- 하루 한 줄인 기록은 활동에서도 한 줄이다
--
-- `goal_entries`는 하루에 한 행이고, 같은 날 다시 적는 것은 update다 — 화면에서
-- 버튼 이름이 '수정'인 그것이다. 그런데 활동 트리거는 insert와 update 양쪽에서
-- 사건을 새로 만들었다. 3을 적고 5로 고치면 피드에 두 줄이 남는다.
--
--   정이 오늘 5번 적었어요     ← 22:14
--   정이 오늘 3번 적었어요     ← 22:13
--
-- 오타 한 번이 남에게는 두 사건이 된다. plan.md 49행("모든 변경은 활동 내역에
-- 남긴다")이 요구하는 것은 **몰래 바뀌지 않는 것**이지, 고칠 때마다 새 줄이
-- 쌓이는 것이 아니다.
--
--
-- ## 한 줄로 접는 방법
--
-- 새 장치를 만들지 않는다. `activity_events`에는 이미 "하루 한 번만 생겨야 하는
-- 사건"을 위한 `dedupe_key`와 `(group_id, date_key, dedupe_key)` 유니크 인덱스가
-- 있다(0009, 한도 단계가 쓴다). 목표 기록에도 같은 키를 준다:
--
--   dedupe_key = 'goal_entry:<goal_id>:<profile_id>',  date_key = 기록의 Frimit 일자
--
-- 다만 `log_activity`의 `on conflict do nothing`으로는 부족하다. 두 번째 기록을
-- 버리면 피드에 옛 숫자가 남아서, 한 줄이 되는 대신 틀린 줄이 된다. 그래서 이
-- 트리거만 직접 upsert하고 **payload를 갈아 끼운다.**
--
-- `kind`까지 갈아 끼우는 것이 이 설계의 핵심이다. 적었다가 지운 사람도 한 줄이다 —
-- 그 줄이 `goal_entry`에서 `goal_cleared`로 바뀔 뿐이다. 사람 한 명의 그날 목표
-- 기록은 활동에서 언제나 정확히 한 줄이고, 그 줄은 지금 사실을 말한다.
--
-- `created_at`도 갱신한다. 값이 바뀌었으면 그건 방금 일어난 일이고, 피드에서
-- 오늘 아침 자리에 조용히 앉아 있으면 아무도 못 본다. 붙어 있던 반응은 그대로
-- 남는다(행이 그대로이므로).

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

  insert into public.activity_events (
    group_id, actor_id, kind, payload, dedupe_key, date_key
  ) values (
    v_goal.group_id,
    v_row.profile_id,
    (case when tg_op = 'DELETE' then 'goal_cleared' else 'goal_entry' end)::public.activity_kind,
    jsonb_build_object(
      'title', v_goal.title,
      'unit', v_goal.unit,
      'amount', v_row.amount,
      'target_amount', v_goal.target_amount
    ),
    'goal_entry:' || v_goal.id || ':' || v_row.profile_id,
    v_row.date_key
  )
  on conflict (group_id, date_key, dedupe_key) where dedupe_key is not null
  do update set
    kind = excluded.kind,
    payload = excluded.payload,
    created_at = now();

  return null;
end;
$$;

comment on function public.log_goal_entry is
  '목표 기록을 활동에 남긴다. 사람 한 명의 그날 기록은 한 줄이고, 고치거나 지우면 그 줄이 바뀐다.';
