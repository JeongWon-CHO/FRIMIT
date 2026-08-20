-- 계정 삭제 (delete_my_account)
--
-- plan.md 4장 마지막 줄이 요구하는 것은 두 문장이 한 번에 성립하는 상태다.
--   · 프로필과 인증 정보를 제거한다
--   · 진행 중인 기간의 공정성을 위해 필요한 합계만 익명 멤버 기록으로 남긴다
--
-- 이 둘은 지금 스키마에서 정면으로 부딪힌다. `profiles.id`가 `auth.users(id)`를
-- **on delete cascade**로 참조하고, 사용량·목표·멤버십이 다시 `profiles`를 cascade로
-- 참조한다. 그래서 인증 정보를 지우는 순간 그 사람의 확정 사용량까지 함께 사라지고,
-- 남은 사람들의 어제 공동 풀 합계가 무너진다. 떠난 사람 때문에 남은 사람의 기록이
-- 바뀌는 것은 이 제품에서 가장 하면 안 되는 일이다.
--
--
-- ## 그래서 프로필을 비석으로 남긴다
--
-- `profiles`에서 `auth.users`로 가는 외래키를 **떼어 낸다.** 그러면 인증 행을 지워도
-- 프로필 행이 남고, 거기에 매달린 열두 개 표의 cascade가 하나도 발동하지 않는다.
-- 남는 행에는 개인을 가리키는 것이 없다 — 닉네임은 '탈퇴한 멤버'로, 아바타는
-- 기본값으로 덮고 `deleted_at`을 찍는다. plan.md가 말한 "익명 멤버 기록"이 이것이다.
--
-- 외래키를 떼어도 프로필이 저절로 생기는 흐름은 그대로다. `handle_new_user`(0001)가
-- auth.users에 행이 생길 때 만들어 주고, 그건 트리거지 제약이 아니다.
--
-- 고아 프로필이 남는 것을 감수하는 설계다. 그게 정확히 우리가 원하는 것이고,
-- 무엇이 고아인지는 `deleted_at`이 말해 준다.
--
--
-- ## 관리자는 자동으로 넘긴다
--
-- `leave_group`은 관리자에게 "먼저 넘기고 나가라"고 막는다(admin_must_transfer).
-- 계정 삭제에는 그 문을 둘 수 없다 — 관리자인 그룹이 하나라도 있으면 계정을
-- 영영 지울 수 없게 되고, 그건 사용자가 자기 계정에 대해 가져야 할 권한이 아니다.
--
-- 대신 남은 멤버 중 **가장 먼저 들어온 사람**에게 넘긴다. 활동량이나 등수로 고르면
-- 그날의 사용량에 따라 관리자가 정해지는 셈이라 설명할 수 없는 결과가 나온다.
-- 가입 순서는 아무도 오늘 바꿀 수 없는 값이다.
--
-- 남는 좌석이 2명 미만이면 넘길 곳이 없으므로 그룹을 보관한다. `leave_group`이
-- 쓰는 판정과 같은 셈이다(그 함수의 `v_will_archive`).
--
--
-- ## 무엇을 지우고 무엇을 남기는가
--
-- 남긴다 — `daily_member_usage`(공동 풀의 근거), `goal_entries`(목표 진행률의 분모),
-- `group_memberships`(그 기간에 누가 있었는지), `activity_events`.
-- 지운다 — `devices`(기기 식별자·푸시 토큰), `usage_snapshots`(기기가 보낸 원본),
-- `reactions`, `nudges`. 남겨서 지킬 공정성이 없고 개인을 가리키는 값들이다.
--
-- 멤버십은 즉시 끊지 않고 `leave_group`과 같이 다음 오전 6시로 예약한다. 오늘의
-- 공동 풀은 이미 그 사람의 시간을 담고 있어서, 지금 빼면 남은 사람들의 잔여가
-- 갑자기 늘어난다. "진행 중인 기간의 공정성"이 이 한 줄이다.

alter table public.profiles
  drop constraint profiles_id_fkey;

comment on table public.profiles is
  'auth.users를 참조하지 않는다. 계정을 지운 뒤에도 익명 비석으로 남아야 하기 때문이다(0012).';

alter table public.profiles
  add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  '계정이 지워진 시각. 이 행은 사람이 아니라 지난 집계를 가리키는 비석이다.';

/**
 * 내 계정을 지운다. 되돌릴 수 없다.
 *
 * 그룹 정리 → 개인 자료 삭제 → 익명화 → 인증 정보 삭제 순서다. 마지막 한 줄이
 * 실패하면 앞의 것들도 함께 되돌아가야 하므로 한 트랜잭션 안에 둔다 — 프로필만
 * 익명이 되고 로그인은 계속 되는 상태가 제일 나쁘다.
 *
 * 잠금 순서는 0004를 따른다: profiles → groups.
 */
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_group public.groups;
  v_rule public.group_rules;
  v_heir uuid;
  v_remaining int;
  v_leaves_at timestamptz;
  v_groups int := 0;
  v_transferred int := 0;
  v_archived int := 0;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  perform 1 from public.profiles p where p.id = v_actor for no key update;

  -- id 순으로 도는 이유는 잠금 순서를 고정하기 위해서다. 두 사람이 같은 두 그룹을
  -- 동시에 떠나면 서로를 기다릴 수 있다.
  for v_group in
    select g.*
      from public.groups g
      join public.group_memberships m on m.group_id = g.id
     where m.profile_id = v_actor
       and (m.effective_until is null or m.effective_until > now())
       and g.status <> 'archived'
     order by g.id
       for no key update of g
  loop
    v_groups := v_groups + 1;

    -- 남는 좌석. `leave_group`과 같은 정의다(탈퇴 예약자도 그 시각까지는 자리를 지킨다).
    select count(*) into v_remaining
      from public.group_memberships m
     where m.group_id = v_group.id
       and m.profile_id <> v_actor
       and (m.effective_until is null or m.effective_until > now());

    if v_group.admin_id = v_actor and v_remaining >= 2 then
      select m.profile_id into v_heir
        from public.group_memberships m
       where m.group_id = v_group.id
         and m.profile_id <> v_actor
         and (m.effective_until is null or m.effective_until > now())
       -- 가장 먼저 들어온 사람. 동시 가입은 id로 갈라 결정적으로 만든다.
       order by m.joined_at, m.profile_id
       limit 1;

      update public.groups set admin_id = v_heir where id = v_group.id;

      update public.group_memberships
         set role = 'admin'
       where group_id = v_group.id and profile_id = v_heir;

      update public.group_memberships
         set role = 'member'
       where group_id = v_group.id and profile_id = v_actor;

      v_transferred := v_transferred + 1;
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
     where group_id = v_group.id
       and profile_id = v_actor;

    -- 넘길 사람이 없으면 그룹이 접힌다. 관리자였든 아니든 같다.
    if v_remaining < 2 then
      update public.groups
         set status = 'archived',
             archived_at = now()
       where id = v_group.id;

      v_archived := v_archived + 1;
    end if;
  end loop;

  -- 개인을 가리키는 것들. 남겨서 지킬 공정성이 없다.
  delete from public.usage_snapshots where profile_id = v_actor;
  delete from public.devices where profile_id = v_actor;
  delete from public.reactions where profile_id = v_actor;
  delete from public.nudges where sender_id = v_actor or recipient_id = v_actor;

  -- 비석. 행은 남지만 사람은 남지 않는다.
  update public.profiles
     set nickname = '탈퇴한 멤버',
         avatar_key = 'avatar-01',
         deleted_at = now()
   where id = v_actor;

  -- 인증 정보. 위에서 외래키를 떼어 냈으므로 비석을 끌고 가지 않는다.
  delete from auth.users where id = v_actor;

  return jsonb_build_object(
    'groups', v_groups,
    'transferred', v_transferred,
    'archived', v_archived
  );
end;
$$;

comment on function public.delete_my_account is
  '내 계정을 지우고 집계는 익명으로 남긴다. 되돌릴 수 없다.';

-- ============================================================================
-- 권한 (GRANT)
-- ============================================================================

revoke execute on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
