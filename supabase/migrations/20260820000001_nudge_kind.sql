-- activity_kind에 'nudge'를 더한다.
--
-- 파일을 따로 두는 이유는 문법이 아니라 트랜잭션 때문이다. `alter type ... add value`로
-- 더한 값은 **그 트랜잭션이 커밋된 뒤에야** 쓸 수 있다. 같은 파일에서 이 값을 쓰는
-- 함수나 제약을 만들면 마이그레이션이 통째로 실패한다. 한 줄짜리 파일이 어색해
-- 보여도 그게 이 규칙을 지키는 유일하게 확실한 방법이다.

alter type public.activity_kind add value 'nudge';
