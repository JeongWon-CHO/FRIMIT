-- service_role 권한
--
-- 프로젝트에서 "Automatically expose new tables"를 끈 결과, 클라이언트 역할
-- (anon/authenticated)뿐 아니라 **service_role까지** 테이블 권한을 잃었다.
--
-- service_role은 RLS를 우회하지만 그건 "정책을 건너뛴다"는 뜻일 뿐, GRANT까지
-- 면제되는 것은 아니다. Edge Function에서 집계 확정·푸시 발송·예약 정리를 하려면
-- 이 권한이 있어야 한다.
--
-- 방향은 유지한다: 클라이언트 역할에는 필요한 것만 명시적으로 열고,
-- 서버 역할에는 전부 연다. service_role 키는 절대 클라이언트로 나가지 않으므로
-- 여기서의 관대함이 사용자 데이터를 노출시키지 않는다.

grant usage on schema public to service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 앞으로 마이그레이션이 만드는 테이블에도 자동으로 적용한다.
-- 서버 역할에 권한 주는 것을 깜빡하면 Edge Function이 런타임에 죽는데,
-- 그건 배포 후에야 드러나는 종류의 실패다.
--
-- 클라이언트 역할(anon/authenticated)에는 일부러 default privileges를 걸지 않는다.
-- 새 테이블이 조용히 열리는 것을 막는 것이 이 설정의 목적이기 때문이다.
alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;
