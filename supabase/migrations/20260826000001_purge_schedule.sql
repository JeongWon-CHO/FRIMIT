-- 보관 기간을 실제로 지키게 한다
--
-- `purge_expired_usage`(0006)와 `purge_expired_activity`(0009)는 만들어만 두고
-- 아무도 부르지 않았다. 0009의 주석도 "예약 작업이 아직 없으므로, 그것을 붙일 때
-- 둘 다 부르면 된다"고 적어 두고 넘어갔다. 그래서 화면이 "활동 내역은 90일 동안
-- 남아요"라고 말하는 동안 실제로는 아무것도 지워지지 않았다. 지키지 않는 약속은
-- 개인정보 처리방침에서 가장 나쁜 종류의 문장이다.
--
-- pg_cron은 이미 켜져 있다 — 대시보드 Cron이 한도 알림 함수를 1분마다 부르는 데
-- 쓰고 있다. 그 자리를 클릭으로 만들면 저장소에 흔적이 남지 않으므로, 이 작업은
-- 마이그레이션에 적는다. `cron.schedule`은 같은 이름으로 다시 부르면 덮어쓴다.
--
--
-- ## 활동 내역 90일 → 14일
--
-- 90일은 사람이 읽을 목적으로는 과하다. 화면은 60개만 읽고 하루 단위로 묶어
-- 보여주며, 석 달 전 "정이 오늘 3번 적었어요"를 찾는 사람은 없다.
--
-- 그렇다고 사나흘로 줄이면 **주말에 앱을 안 켠 사람이 금요일 일을 영영 못 본다.**
-- 이 앱의 자연 단위는 7일이고(목표의 최소 기간, 최근 기록 막대), 한 주를 통째로
-- 놓쳐도 지난주가 보이려면 그 두 배가 필요하다.
--
-- **사용량 쪽은 그대로 둔다.** 일별 합계(`daily_member_usage`)의 90일은 읽을거리가
-- 아니라 재료다 — 지난 기록 화면이 아직 7일만 읽지만, 지운 날은 되살아나지 않고
-- 남의 지난 집계까지 함께 무너진다. 활동 내역은 지워도 다시 만들 것이 없다.

create extension if not exists pg_cron;

create or replace function public.purge_expired_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  -- 14일. 한 주를 통째로 놓친 사람도 지난주를 볼 수 있는 최소치다.
  delete from public.activity_events
   where created_at < now() - interval '14 days';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('deleted_events', v_deleted);
end;
$$;

comment on function public.purge_expired_activity is
  '보관 기간(14일)이 지난 활동 내역을 지운다. 예약 작업 전용(service_role).';

-- 03:10 KST. 하루 경계(오전 6시)에서 세 시간 떨어져 있어 집계가 넘어가는 순간과
-- 겹치지 않고, 한국에서 아무도 안 쓰는 시각이다.
select cron.schedule(
  'frimit-purge',
  '10 18 * * *',
  $$select public.purge_expired_activity(), public.purge_expired_usage()$$
);
