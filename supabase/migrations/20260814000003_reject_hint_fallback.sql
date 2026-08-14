-- 묶음 전송에서 거절 사유가 빈 문자열로 나가던 문제
--
-- 0005는 `coalesce(v_hint, 'unknown')`으로 사유를 채웠는데, PostgreSQL은 hint가
-- 없는 오류에 대해 NULL이 아니라 **빈 문자열**을 준다. coalesce가 걸리지 않아
-- 클라이언트에는 사유 없는 거절이 그대로 전달됐고, 화면에는 `거절 1()`처럼
-- 괄호만 남았다.
--
-- 실기기 검증에서 이게 드러났다: 예전 빌드가 남긴 로컬 전용 그룹 id를 올리자
-- uuid 캐스팅에서 22P02로 죽었는데, 그 오류에는 hint가 없다. "무엇이 왜 거절됐는지"를
-- 알 수 없는 것이 문제의 본질이므로, hint가 비면 SQLSTATE라도 실어 보낸다.

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
  v_sqlstate text;
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
      get stacked diagnostics
        v_hint = pg_exception_hint,
        v_message = message_text,
        v_sqlstate = returned_sqlstate;

      v_one := jsonb_build_object(
        'status', 'rejected',
        'group_id', v_item ->> 'group_id',
        -- 우리가 던진 예외에는 슬러그가 붙어 있다. 그 외(캐스팅 실패 등)는
        -- hint가 빈 문자열로 오므로 SQLSTATE를 대신 싣는다.
        'hint', coalesce(nullif(v_hint, ''), 'sqlstate_' || v_sqlstate),
        'message', v_message
      );
    end;

    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return v_results;
end;
$$;
