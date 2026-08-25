-- 초대 코드 미리보기
--
-- 참여하기 전에는 그룹을 읽을 수 없다. groups의 조회 정책이 `is_group_member(id)`
-- 인데 가입하려는 사람은 정의상 아직 멤버가 아니기 때문이다(0002). 그래서 초대
-- 화면은 여태 **가짜 그룹**을 그리고 있었다 — 아무 여섯 자리나 넣어도 이름 없는
-- 그룹에 멤버 셋과 "자리 하나가 비어 있어요"가 나왔고, 코드가 틀렸다는 사실은 그
-- 다음 버튼을 눌러야 알았다.
--
-- join_group이 초대 코드를 아는 사람에게 그 한 행을 열어 주는 것과 같은 이유로,
-- 참여 직전에 "무엇에 참여하는지"도 열어 준다. 다만 **참여의 부작용은 없다.**
--
--
-- ## 무엇을 돌려주는가
--
-- 이름, 색, 상태, 좌석 수, 하루 공동 한도. 그게 전부다.
--
-- 멤버의 닉네임과 아바타는 **넣지 않는다.** 코드 공간이 100만이라 로그인한 사람은
-- 누구나 전수 조회로 활성 그룹 목록을 만들 수 있는데, 거기에 사람 이름까지 실리면
-- 수확의 값어치가 달라진다. 그룹 이름과 인원은 참여를 결정하는 데 필요한 최소치라
-- 감수하고, 얼굴은 참여한 다음에 본다. 화면도 빈 자리와 앉은 자리의 **수**만 그린다.
--
-- ponytail: 전수 조회를 막는 장치는 없다. 남용이 보이면 프로필당 호출 수를 세는
-- 테이블 하나(또는 Supabase 쪽 rate limit)가 다음 수순이다.
--
--
-- ## 좌석 수
--
-- join_group의 정원 검사와 **같은 정의**를 쓴다(`effective_until is null or > now()`).
-- 다르게 세면 화면에는 자리가 남았는데 서버가 group_full로 거절하는 조합이 생긴다.

create or replace function public.group_preview(target_invite_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_group public.groups;
  v_rule public.group_rules;
begin
  -- 익명에게는 열지 않는다. 어차피 참여하려면 로그인해야 하고, 그 전에 코드를
  -- 긁어 갈 수 있는 창구를 따로 둘 이유가 없다.
  if (select auth.uid()) is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501', hint = 'not_authenticated';
  end if;

  -- groups_invite_code_active 부분 유니크 인덱스 덕분에 최대 한 행이다.
  select * into v_group
    from public.groups g
   where g.invite_code = target_invite_code
     and g.status <> 'archived';

  if not found then
    -- join_group과 같은 문구·같은 슬러그다. 코드가 틀렸다는 말은 어느 쪽에서
    -- 왔든 한 가지여야 한다.
    raise exception '초대 코드가 올바르지 않습니다.'
      using errcode = 'PT404', hint = 'invalid_invite_code';
  end if;

  v_rule := public.effective_rule(v_group.id, now());

  return jsonb_build_object(
    'name', v_group.name,
    'color_key', v_group.color_key,
    'status', v_group.status,
    'member_count', (
      select count(*)
        from public.group_memberships m
       where m.group_id = v_group.id
         and (m.effective_until is null or m.effective_until > now())
    ),
    'daily_limit_seconds', v_rule.daily_limit_seconds
  );
end;
$$;

comment on function public.group_preview is
  '초대 코드로 그룹 요약(이름·인원·한도)만 읽는다. 참여의 부작용은 없고 사람 이름은 싣지 않는다.';

revoke execute on function public.group_preview(text) from public;
grant execute on function public.group_preview(text) to authenticated;
