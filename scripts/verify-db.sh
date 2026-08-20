#!/usr/bin/env bash
#
# Supabase 스키마 검증 — 그룹 수명주기 RPC, 사용량 집계, 규칙 변경 전원 동의
#
# Docker가 없어 로컬 스택도 pgTAP도 쓸 수 없다. 그래서 원격 프로젝트에 실제로
# 붙어서, 클라이언트가 보는 것과 똑같은 PostgREST 경로로 확인한다. 이 스크립트가
# 이 프로젝트의 유일한 DB 검증 수단이다.
#
# 확인하는 것은 크게 셋이다.
#   1. RPC가 제품 규칙대로 동작하는가 (정원 8명, 5그룹, 준비 2명, 관리자 이전)
#   2. 반영 시각이 오전 6시 경계에 정확히 걸리는가
#   3. **테이블 직접 쓰기로 그 규칙을 우회할 수 없는가** — 이게 제일 중요하다.
#      RPC가 아무리 잘 검사해도 PATCH로 effective_from을 당길 수 있으면 무의미하다.
#
# 실행:
#   .env.local에 SB_ANON / SB_SECRET을 채운 뒤  npm run db:verify
#
# ⚠️ 링크된 원격 프로젝트에 실제로 쓴다. t1~t9@frimit.test 계정과 그 계정이 만든
# 그룹만 건드리고, 끝나면(실패해도) 전부 지운다. 운영 데이터가 있는 프로젝트에는
# 돌리지 말 것.

set -uo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "❌ .env.local이 없습니다. SB_URL/SB_ANON/SB_SECRET을 채워 주세요." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${SB_URL:?SB_URL이 필요합니다}"
: "${SB_ANON:?SB_ANON이 필요합니다 (Publishable key)}"
: "${SB_SECRET:?SB_SECRET이 필요합니다 (Secret key)}"
: "${SB_TEST_PASSWORD:=frimit-test-1234}"

command -v jq > /dev/null || { echo "❌ jq가 필요합니다" >&2; exit 1; }

TEST_EMAIL_RE='^t[0-9]+@frimit\.test$'
PASS=0
FAIL=0

# ============================================================================
# HTTP
# ============================================================================

CURL_BODY=""
CURL_CODE=""

# call <METHOD> <URL> <bearer> <apikey> [json]
call() {
  local resp
  resp=$(curl -s -w $'\n%{http_code}' -X "$1" "$2" \
    -H "apikey: $4" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${5:+-d "$5"})
  CURL_CODE="${resp##*$'\n'}"
  CURL_BODY="${resp%$'\n'*}"
}

TOKEN_DIR="$(mktemp -d)"
trap 'cleanup; rm -rf "$TOKEN_DIR"' EXIT

# ⚠️ zsh에서 `local a="$1" b="...$a"`를 한 줄에 쓰면 $a가 호출자 스코프를 참조해
# 캐시 파일명이 조용히 합쳐진다. 줄을 나눠 쓴다.
jwt() {
  local n="$1"
  local f="$TOKEN_DIR/t$n"
  if [ ! -s "$f" ]; then
    curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
      -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
      -d "{\"email\":\"t$n@frimit.test\",\"password\":\"$SB_TEST_PASSWORD\"}" \
      | jq -r '.access_token // empty' > "$f"
  fi
  cat "$f"
}

uid() {
  local n="$1"
  local f="$TOKEN_DIR/uid$n"
  if [ ! -s "$f" ]; then
    curl -s "$SB_URL/auth/v1/user" -H "apikey: $SB_ANON" \
      -H "Authorization: Bearer $(jwt "$n")" | jq -r '.id // empty' > "$f"
  fi
  cat "$f"
}

# 인자 없는 RPC의 기본 본문. `${3:-{\}}`처럼 인라인으로 쓰면 셸에 따라 백슬래시가
# 그대로 남아 잘못된 JSON이 나간다(그러면 403이어야 할 응답이 400으로 보인다).
EMPTY_JSON='{}'

rpc()      { call POST "$SB_URL/rest/v1/rpc/$2" "$(jwt "$1")" "$SB_ANON" "${3:-$EMPTY_JSON}"; }
# 만든 행을 돌려받아야 할 때(기기 등록 등)만 쓴다.
post()     {
  local n="$1"
  local resp
  resp=$(curl -s -w $'\n%{http_code}' -X POST "$SB_URL/rest/v1/$2" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $(jwt "$n")" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d "$3")
  CURL_CODE="${resp##*$'\n'}"
  CURL_BODY="${resp%$'\n'*}"
}
rpc_anon() { call POST "$SB_URL/rest/v1/rpc/$1" "" "$SB_ANON" "${2:-$EMPTY_JSON}"; }
patch()    { call PATCH "$SB_URL/rest/v1/$2" "$(jwt "$1")" "$SB_ANON" "$3"; }
svc()      { call "$1" "$SB_URL/rest/v1/$2" "$SB_SECRET" "$SB_SECRET" "${3:-}"; }

# 마지막 응답에서 값 하나 꺼내기. null은 빈 문자열로 바꾼다.
# `// empty`를 쓰면 안 된다 — jq에서 false도 falsy라 `is_ready: false`가 통째로 사라진다.
field() { jq -r "$1" <<< "$CURL_BODY" 2> /dev/null | sed 's/^null$//'; }
# 오류면 슬러그, 성공이면 ok
hint()  { jq -r 'if type == "object" and has("hint") and .hint != null then .hint else "ok" end' <<< "$CURL_BODY"; }

# ============================================================================
# 검사 기록
# ============================================================================

check() { # check <설명> <기대> <실제>
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1))
    printf '  ✅ %s\n' "$1"
  else
    FAIL=$((FAIL + 1))
    printf '  ❌ %s — 기대 %s, 실제 %s\n' "$1" "$2" "$3"
  fi
}

section() { printf '\n▸ %s\n' "$1"; }

# 발송 큐는 운영 Cron(1분 주기)과 공유한다. 그쪽이 먼저 집어 가면 검증이 빈손이
# 되므로, 확인할 사건만 대기로 되돌린 직후에 집는다. `release_push_batch`가
# 원래 그런 용도다(발송 실패 복구).
reclaim() { # reclaim <PostgREST 조건> → CURL_BODY에 claim 결과가 담긴다
  svc GET "activity_events?group_id=eq.$GROUP_B&$1&select=id"
  svc POST "rpc/release_push_batch" "{\"event_ids\":$(jq -c '[.[].id]' <<< "$CURL_BODY")}" > /dev/null
  svc POST "rpc/claim_push_batch" '{"max_events":100}'
}

# ============================================================================
# 준비와 정리
# ============================================================================

test_user_ids() {
  curl -s "$SB_URL/auth/v1/admin/users?per_page=1000" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
    | jq -r --arg re "$TEST_EMAIL_RE" '.users[]? | select(.email | test($re)) | .id'
}

# 그룹을 먼저 지워야 계정을 지울 수 있다. groups.admin_id가 on delete restrict라
# 순서를 바꾸면 계정 삭제가 500으로 실패한다. (계정 삭제 기능을 만들 때 이 제약을
# 어떻게 풀지 정해야 한다 — 관리자 자동 이전이든 그룹 보관이든.)
cleanup() {
  local ids csv
  ids=$(test_user_ids)
  [ -n "$ids" ] || return 0

  csv=$(tr '\n' ',' <<< "$ids" | sed 's/,$//')
  curl -s -o /dev/null -X DELETE "$SB_URL/rest/v1/groups?admin_id=in.($csv)" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"

  while read -r id; do
    [ -n "$id" ] || continue
    curl -s -o /dev/null -X DELETE "$SB_URL/auth/v1/admin/users/$id" \
      -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"
  done <<< "$ids"
}

create_users() {
  local i
  for i in $(seq 1 9); do
    curl -s -o /dev/null -X POST "$SB_URL/auth/v1/admin/users" \
      -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"t$i@frimit.test\",\"password\":\"$SB_TEST_PASSWORD\",\"email_confirm\":true}"
  done
}

# 두 명이 준비를 마치고 시작한 그룹을 만든다. "gid code"를 돌려준다.
start_two_person_group() { # <관리자N> <멤버N> <이름> [공동 한도]
  local admin="$1"
  local member="$2"
  local nm="$3"
  local limit="${4:-}"
  local gid code

  rpc "$admin" create_group "{\"group_name\":\"$nm\"}"
  gid=$(field .group.id)
  code=$(field .group.invite_code)

  # 시작 전에만 관리자가 규칙을 바로 고칠 수 있다.
  if [ -n "$limit" ]; then
    rpc "$admin" update_draft_rule "{\"target_group_id\":\"$gid\",\"new_daily_limit_seconds\":$limit}" > /dev/null
  fi

  rpc "$member" join_group "{\"target_invite_code\":\"$code\"}"
  patch "$admin"  "group_memberships?group_id=eq.$gid&profile_id=eq.$(uid "$admin")"  '{"is_ready":true}'
  patch "$member" "group_memberships?group_id=eq.$gid&profile_id=eq.$(uid "$member")" '{"is_ready":true}'
  rpc "$admin" start_group "{\"target_group_id\":\"$gid\"}"

  echo "$gid $code"
}

echo "🧹 이전 실행이 남긴 테스트 데이터 정리"
cleanup
echo "👤 테스트 계정 9개 생성"
create_users

# ============================================================================
section "생성과 노출 범위"
# ============================================================================

rpc 1 create_group '{"group_name":"검증그룹","daily_limit_seconds":7200}'
GROUP_A=$(field .group.id)
CODE_A=$(field .group.invite_code)

check "create_group 성공"                200 "$CURL_CODE"
check "상태가 draft"                     draft "$(field .group.status)"
check "초대 코드가 6자리 숫자"           yes "$(grep -qE '^[0-9]{6}$' <<< "$CODE_A" && echo yes || echo no)"
check "규칙 1번 버전이 함께 생김"        1 "$(field .rule.version)"
check "관리자 멤버십의 반영 시각은 아직 없음" "" "$(field .membership.effective_from)"
check "좌석 1명"                         1 "$(field .member_count)"
check "활성 멤버는 0명 (draft라서)"      0 "$(field .active_member_count)"

rpc_anon create_group '{"group_name":"익명"}'
check "토큰 없이는 호출 불가"            401 "$CURL_CODE"

rpc 1 group_snapshot "{\"target_group_id\":\"$GROUP_A\",\"viewer_id\":\"$(uid 1)\"}"
check "내부 헬퍼는 노출되지 않음"        403 "$CURL_CODE"

rpc 1 join_group '{"target_invite_code":"000000"}'
check "없는 초대 코드"                   invalid_invite_code "$(hint)"
check "PT404가 HTTP 404로 매핑됨"        404 "$CURL_CODE"

rpc 1 create_group '{"group_name":"   "}'
check "공백뿐인 이름 거부"               invalid_group_name "$(hint)"
rpc 1 create_group '{"group_name":"ok","daily_limit_seconds":100}'
check "너무 짧은 한도 거부"              invalid_daily_limit "$(hint)"

# ============================================================================
section "정원과 그룹 수 상한"
# ============================================================================

rpc 2 join_group "{\"target_invite_code\":\"$CODE_A\"}"
check "가입 성공"                        member "$(field .membership.role)"
check "draft 가입자는 반영 시각 없음"    "" "$(field .membership.effective_from)"
check "좌석 2명"                         2 "$(field .member_count)"

rpc 2 join_group "{\"target_invite_code\":\"$CODE_A\"}"
check "이미 멤버면 거부"                 already_member "$(hint)"

for i in 3 4 5 6 7 8; do
  rpc "$i" join_group "{\"target_invite_code\":\"$CODE_A\"}" > /dev/null
done
check "8명까지 참"                       8 "$(field .member_count)"

rpc 9 join_group "{\"target_invite_code\":\"$CODE_A\"}"
check "9번째는 정원 초과"                group_full "$(hint)"
check "PT409가 HTTP 409로 매핑됨"        409 "$CURL_CODE"

# draft 그룹만으로 5개를 채운다. "활성 그룹"에 draft가 포함되는지가 여기서 갈린다.
for i in 1 2 3 4 5; do
  rpc 9 create_group "{\"group_name\":\"t9-$i\"}" > /dev/null
done
rpc 9 create_group '{"group_name":"t9-6"}'
check "draft 5개 뒤 6번째 생성 거부"     too_many_groups "$(hint)"
rpc 9 join_group "{\"target_invite_code\":\"$CODE_A\"}"
check "draft 5개 뒤 가입도 거부"         too_many_groups "$(hint)"

# ============================================================================
section "시작"
# ============================================================================

rpc 1 start_group "{\"target_group_id\":\"$GROUP_A\"}"
check "준비된 멤버가 없으면 시작 불가"   not_enough_ready "$(hint)"

patch 1 "group_memberships?group_id=eq.$GROUP_A&profile_id=eq.$(uid 1)" '{"is_ready":true}'
check "본인 준비 토글은 허용"            204 "$CURL_CODE"
patch 2 "group_memberships?group_id=eq.$GROUP_A&profile_id=eq.$(uid 2)" '{"is_ready":true}'

rpc 2 start_group "{\"target_group_id\":\"$GROUP_A\"}"
check "관리자가 아니면 시작 불가"        not_admin "$(hint)"

rpc 1 start_group "{\"target_group_id\":\"$GROUP_A\"}"
STARTED_AT=$(field .group.started_at)
check "시작 성공"                        active "$(field .group.status)"
check "내 반영 시각 = 시작 시각"         "$STARTED_AT" "$(field .membership.effective_from)"
check "활성 멤버 8명"                    8 "$(field .active_member_count)"

svc GET "group_memberships?group_id=eq.$GROUP_A&select=effective_from"
check "전원이 같은 반영 시각을 받음"     "[\"$STARTED_AT\"]" "$(jq -c '[.[].effective_from] | unique' <<< "$CURL_BODY")"

rpc 1 start_group "{\"target_group_id\":\"$GROUP_A\"}"
check "두 번 시작 불가"                  already_started "$(hint)"

# ============================================================================
section "직접 쓰기로 우회할 수 있는가"
#
# 여기서 하나라도 204가 나오면 위의 모든 검사가 무의미해진다.
# RPC는 규칙을 지키는데 클라이언트가 테이블을 직접 고쳐 같은 일을 할 수 있다는 뜻이다.
# ============================================================================

patch 2 "group_memberships?group_id=eq.$GROUP_A&profile_id=eq.$(uid 2)" '{"effective_from":"2020-01-01T00:00:00Z"}'
check "반영 시각 직접 수정 차단"         403 "$CURL_CODE"
patch 2 "group_memberships?group_id=eq.$GROUP_A&profile_id=eq.$(uid 2)" '{"role":"admin"}'
check "관리자 자칭 차단"                 403 "$CURL_CODE"
patch 2 "group_memberships?group_id=eq.$GROUP_A&profile_id=eq.$(uid 2)" '{"effective_until":null}'
check "탈퇴 예약 직접 수정 차단"         403 "$CURL_CODE"
patch 1 "groups?id=eq.$GROUP_A" '{"status":"archived"}'
check "관리자의 상태 직접 수정 차단"     403 "$CURL_CODE"
patch 1 "groups?id=eq.$GROUP_A" '{"invite_code":"111111"}'
check "초대 코드 직접 수정 차단"         403 "$CURL_CODE"
patch 1 "groups?id=eq.$GROUP_A" '{"name":"이름변경"}'
check "이름 변경은 허용"                 204 "$CURL_CODE"

# ============================================================================
section "반영 시각이 오전 6시 경계에 걸리는가"
# ============================================================================

# 공동 한도를 900초로 낮춰 만든다. 서버가 "구간 시작 이후 흐른 시간"을 넘는
# 누적값을 거절하므로(0006), 시험값이 크면 오전 6시 직후에 이 스크립트를 돌렸을 때
# 정상 동작이 거절로 보인다. 시험값을 전부 15분 여유 안에 두어 시각과 무관하게 한다.
read -r GROUP_B CODE_B < <(start_two_person_group 4 5 "경계확인" 900)

rpc 6 join_group "{\"target_invite_code\":\"$CODE_B\"}"
JOIN_AT=$(field .membership.effective_from)
check "시작된 그룹 가입자는 예약된다"    "$(field .next_period_start)" "$JOIN_AT"
check "아직 활성 멤버는 아님"            2 "$(field .active_member_count)"
check "좌석은 이미 차지함"               3 "$(field .member_count)"

rpc 6 frimit_next_period_start "{\"at_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"time_zone\":\"Asia/Seoul\",\"reset_hour\":6}"
check "서버의 다음 경계 함수와 일치"     "$(jq -r . <<< "$CURL_BODY")" "$JOIN_AT"

# ============================================================================
section "관리자 이전과 탈퇴"
# ============================================================================

rpc 1 leave_group "{\"target_group_id\":\"$GROUP_A\"}"
check "관리자는 넘기기 전엔 못 나감"     admin_must_transfer "$(hint)"

rpc 1 transfer_admin "{\"target_group_id\":\"$GROUP_A\",\"new_admin_id\":\"$(uid 1)\"}"
check "자기 자신에게 이전 불가"          already_admin "$(hint)"
rpc 1 transfer_admin "{\"target_group_id\":\"$GROUP_A\",\"new_admin_id\":\"$(uid 9)\"}"
check "비멤버에게 이전 불가"             target_not_member "$(hint)"
rpc 2 transfer_admin "{\"target_group_id\":\"$GROUP_A\",\"new_admin_id\":\"$(uid 3)\"}"
check "관리자가 아니면 이전 불가"        not_admin "$(hint)"

rpc 1 transfer_admin "{\"target_group_id\":\"$GROUP_A\",\"new_admin_id\":\"$(uid 2)\"}"
check "이전 성공"                        "$(uid 2)" "$(field .group.admin_id)"
check "넘긴 사람은 일반 멤버가 됨"       member "$(field .membership.role)"
svc GET "group_memberships?group_id=eq.$GROUP_A&role=eq.admin&select=profile_id"
check "admin 역할은 한 명뿐"             1 "$(jq -r 'length' <<< "$CURL_BODY")"

rpc 1 leave_group "{\"target_group_id\":\"$GROUP_A\"}"
LEAVE_AT=$(field .membership.effective_until)
check "탈퇴는 다음 경계로 예약"          "$(field .next_period_start)" "$LEAVE_AT"
check "그룹은 그대로 active"             active "$(field .group.status)"
check "좌석은 6시까지 유지"              8 "$(field .member_count)"

rpc 1 join_group "{\"target_invite_code\":\"$CODE_A\"}"
check "재가입은 탈퇴 철회로 처리"        "" "$(field .membership.effective_until)"
check "철회해도 반영 시각은 그대로"      "$STARTED_AT" "$(field .membership.effective_from)"

# 오전 6시를 실제로 넘길 수는 없으므로, 탈퇴가 이미 반영된 상태를 만들어 확인한다.
svc PATCH "group_memberships?group_id=eq.$GROUP_A&profile_id=eq.$(uid 1)" '{"effective_until":"2020-01-01T00:00:00Z"}'
rpc 1 join_group "{\"target_invite_code\":\"$CODE_A\"}"
check "반영된 탈퇴 뒤 재가입 성공"       200 "$CURL_CODE"
check "되살아난 멤버십은 새로 예약됨"    "$(field .next_period_start)" "$(field .membership.effective_from)"
check "준비 상태는 초기화됨"             false "$(field .membership.is_ready)"

# ============================================================================
section "보관"
# ============================================================================

read -r GROUP_C CODE_C < <(start_two_person_group 7 8 "보관확인")

rpc 8 leave_group "{\"target_group_id\":\"$GROUP_C\"}"
check "좌석이 2명 미만이 되면 보관"      archived "$(field .group.status)"
check "보관 시각이 기록됨"               yes "$([ -n "$(field .group.archived_at)" ] && echo yes || echo no)"

rpc 3 join_group "{\"target_invite_code\":\"$CODE_C\"}"
check "보관된 그룹의 코드는 죽은 코드"   invalid_invite_code "$(hint)"
rpc 7 start_group "{\"target_group_id\":\"$GROUP_C\"}"
check "보관된 그룹은 시작 불가"          group_archived "$(hint)"
rpc 7 leave_group "{\"target_group_id\":\"$GROUP_C\"}"
check "보관된 그룹은 탈퇴 불가"          group_archived "$(hint)"

# 관리자 이전을 요구하면 "넘기자마자 보관"이 되어 아무도 못 나가는 상태가 된다.
read -r GROUP_D _ < <(start_two_person_group 3 6 "면제확인")
rpc 3 leave_group "{\"target_group_id\":\"$GROUP_D\"}"
check "보관될 그룹이면 이전 면제"        archived "$(field .group.status)"

# ============================================================================
section "사용량 스냅샷 — 기록과 멱등성"
#
# GROUP_B를 그대로 쓴다. t4·t5는 시작 시각부터 집계 대상이고, t6은 다음 오전
# 6시부터라 이번 구간에는 들어오지 않는다. 그 차이가 여기서 검증된다.
# ============================================================================

# ISO 8601 시각을 며칠 옮긴다. macOS와 Linux의 date 차이를 피하려고 python을 쓴다.
shift_days() { # <iso> <일수(+/-)>
  python3 - "$1" "$2" <<'PY'
import sys, datetime
at = datetime.datetime.fromisoformat(sys.argv[1].replace('Z', '+00:00'))
print((at + datetime.timedelta(days=float(sys.argv[2]))).isoformat())
PY
}

register_device() { # <사용자N> → 기기 id
  post "$1" devices \
    "{\"profile_id\":\"$(uid "$1")\",\"platform\":\"ios\",\"permission_state\":\"granted\"}"
  jq -r '.[0].id' <<< "$CURL_BODY"
}

DEV4=$(register_device 4)
DEV5=$(register_device 5)
DEV6=$(register_device 6)
DEV7=$(register_device 7)

rpc 4 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
PERIOD=$(field .period_start)
check "공동 풀 조회 성공"                 200 "$CURL_CODE"
check "아직 아무도 안 올려서 합계 0"      0 "$(field .total_seconds)"
check "다음 구간 가입자는 집계 대상 아님" 2 "$(field .member_count)"
check "잔여는 한도 전체"                  900 "$(field .remaining_seconds)"

snap() { # snap <사용자N> <기기> <초> <순번> [그룹]
  rpc "$1" record_usage_snapshot "{
    \"target_device_id\":\"$2\",
    \"target_group_id\":\"${5:-$GROUP_B}\",
    \"period_start\":\"$PERIOD\",
    \"cumulative_seconds\":$3,
    \"collected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"permission_state\":\"granted\",
    \"source\":\"ios-device-activity\",
    \"sequence\":$4
  }"
}

snap 4 "$DEV4" 300 1
check "첫 스냅샷 기록"                    recorded "$(field .status)"
check "확정값 300초"                      300 "$(field .confirmed_seconds)"

snap 4 "$DEV4" 300 1
check "같은 순번은 중복 처리"             duplicate "$(field .status)"

snap 4 "$DEV4" 150 2
check "낮은 값은 채택하지 않음"           stale "$(field .status)"
check "확정값은 그대로 300초"             300 "$(field .confirmed_seconds)"

snap 4 "$DEV4" 600 3
check "높은 값은 채택"                    recorded "$(field .status)"
check "확정값 600초"                      600 "$(field .confirmed_seconds)"

# 앱을 껐다 켜기만 하면 같은 값이 새 순번으로 다시 온다. 기기의 sequence는 스냅샷을
# 읽을 때마다 오르므로 이게 재동기화의 기본 모양이고, duplicate보다 훨씬 흔하다.
snap 4 "$DEV4" 600 4
check "같은 값을 새 순번으로 다시 올림"   stale "$(field .status)"
check "확정값은 그대로"                   600 "$(field .confirmed_seconds)"
check "오른 만큼은 0초"                   0 "$(field .gained_seconds)"

# 지금까지 순번 1·2·3·4를 올렸고, 그중 1은 두 번 보냈다. 원본은 4줄이어야 한다.
svc GET "usage_snapshots?group_id=eq.$GROUP_B&profile_id=eq.$(uid 4)&select=sequence"
check "원본은 순번당 한 줄"               4 "$(jq -r 'length' <<< "$CURL_BODY")"

# ============================================================================
section "사용량 — 자격과 구간 검증"
# ============================================================================

snap 6 "$DEV6" 600 1
check "다음 구간 가입자는 거절"           not_in_period "$(hint)"

snap 4 "$DEV5" 600 9
check "남의 기기로는 못 올림"             device_not_found "$(hint)"

DEV4_OLD="$DEV4"
DEV4=$(register_device 4)   # 새 기기가 등록되면 이전 기기는 비활성이 된다
snap 4 "$DEV4_OLD" 600 4
check "물러난 기기는 거절"                device_inactive "$(hint)"

snap 7 "$DEV7" 600 1 "$GROUP_C"
check "보관된 그룹은 집계하지 않음"       group_not_collecting "$(hint)"

odd_period() { # <구간> <순번> — 경계가 아니거나 범위를 벗어난 구간으로 시도
  rpc 4 record_usage_snapshot "{
    \"target_device_id\":\"$DEV4\", \"target_group_id\":\"$GROUP_B\",
    \"period_start\":\"$1\", \"cumulative_seconds\":600,
    \"collected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"permission_state\":\"granted\",
    \"source\":\"ios-device-activity\", \"sequence\":$2 }"
}

odd_period "$(shift_days "$PERIOD" 0.0417)" 5
check "경계가 아닌 시각은 거절"           invalid_period_start "$(hint)"
odd_period "$(shift_days "$PERIOD" 1)" 6
check "아직 오지 않은 구간은 거절"        future_period "$(hint)"
odd_period "$(shift_days "$PERIOD" -8)" 7
check "보관 기간을 넘긴 구간은 거절"      period_too_old "$(hint)"

# 구간의 시작만 보고 길이를 보지 않으면, 아직 흐르지 않은 시간을 쓴 값이 들어온다.
# 실제로 Android 1차 측정에서 11시간짜리 구간에 22시간이 올라왔다. 확정값은
# 최대값으로만 움직이므로 한 번 들어오면 그날을 통째로 오염시킨다.
# 90000은 컬럼 상한(서머타임 25시간용 여유)이라 어느 시각에 돌려도 흐른 시간을 넘는다.
snap 4 "$DEV4" 90000 8
check "흐른 시간보다 큰 누적값은 거절"    cumulative_exceeds_period "$(hint)"
check "PT400이 HTTP 400으로 매핑됨"       400 "$CURL_CODE"

# ============================================================================
section "사용량 — 집계값을 직접 고칠 수 있는가"
# ============================================================================

post 4 usage_snapshots "{\"device_id\":\"$DEV4\",\"group_id\":\"$GROUP_B\",\"profile_id\":\"$(uid 4)\",\"period_start\":\"$PERIOD\",\"cumulative_seconds\":0,\"collected_at\":\"$PERIOD\",\"permission_state\":\"granted\",\"source\":\"ios-device-activity\",\"sequence\":99}"
check "스냅샷 직접 insert 차단"           403 "$CURL_CODE"

post 4 daily_member_usage "{\"group_id\":\"$GROUP_B\",\"profile_id\":\"$(uid 4)\",\"period_start\":\"$PERIOD\",\"date_key\":\"2026-01-01\",\"cumulative_seconds\":0,\"last_collected_at\":\"$PERIOD\",\"last_sequence\":0,\"source\":\"ios-device-activity\",\"permission_state\":\"granted\"}"
check "확정값 직접 insert 차단"           403 "$CURL_CODE"

patch 4 "daily_member_usage?group_id=eq.$GROUP_B&profile_id=eq.$(uid 4)" '{"cumulative_seconds":0}'
check "확정값 직접 수정 차단"             403 "$CURL_CODE"

rpc 4 period_member_ids "{\"target_group_id\":\"$GROUP_B\",\"period_start\":\"$PERIOD\",\"period_end\":\"$PERIOD\"}"
check "구간 멤버 헬퍼는 미노출"           403 "$CURL_CODE"
rpc 4 purge_expired_usage
check "정리 함수는 미노출"                403 "$CURL_CODE"

# ============================================================================
section "공동 풀 합계"
# ============================================================================

snap 5 "$DEV5" 450 1
check "다른 멤버도 기록"                  recorded "$(field .status)"

rpc 4 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
check "합계는 멤버들의 합"                1050 "$(field .total_seconds)"
check "한도를 넘으면 잔여는 0에서 멈춤"   0 "$(field .remaining_seconds)"
check "초과분이 따로 오른다"              150 "$(field .over_seconds)"

rpc 9 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
check "비멤버는 합계를 볼 수 없음"        not_a_member "$(hint)"

call GET "$SB_URL/rest/v1/daily_member_usage?group_id=eq.$GROUP_B&select=profile_id" "$(jwt 5)" "$SB_ANON"
check "같은 그룹 멤버는 서로의 값을 봄"   2 "$(jq -r 'length' <<< "$CURL_BODY")"
call GET "$SB_URL/rest/v1/daily_member_usage?select=profile_id" "$(jwt 9)" "$SB_ANON"
check "비멤버에게는 보이지 않음"          0 "$(jq -r 'length' <<< "$CURL_BODY")"
call GET "$SB_URL/rest/v1/usage_snapshots?select=profile_id" "$(jwt 5)" "$SB_ANON"
check "원본은 본인 것만 보임"             "$(uid 5)" "$(jq -r '[.[].profile_id] | unique | .[0] // ""' <<< "$CURL_BODY")"

# ============================================================================
section "묶음 전송"
#
# 그룹 하나가 실패했다는 이유로 나머지 그룹의 사용량까지 버려지면, 사용자는
# 이유를 알 수 없는 채로 시간을 잃는다.
# ============================================================================

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
rpc 4 record_usage_snapshots "{\"snapshots\":[
  {\"device_id\":\"$DEV4\",\"group_id\":\"$GROUP_B\",\"period_start\":\"$PERIOD\",
   \"cumulative_seconds\":750,\"collected_at\":\"$NOW\",\"permission_state\":\"granted\",
   \"source\":\"ios-device-activity\",\"sequence\":10},
  {\"device_id\":\"$DEV4\",\"group_id\":\"$GROUP_C\",\"period_start\":\"$PERIOD\",
   \"cumulative_seconds\":750,\"collected_at\":\"$NOW\",\"permission_state\":\"granted\",
   \"source\":\"ios-device-activity\",\"sequence\":10}
]}"
check "묶음 호출 성공"                    200 "$CURL_CODE"
check "첫 건은 기록됨"                    recorded "$(field '.[0].status')"
check "둘째 건이 실패해도 앞은 살아남음"  rejected "$(field '.[1].status')"
check "거절 사유가 담김"                  group_not_collecting "$(field '.[1].hint')"

rpc 4 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
check "묶음으로 올린 값이 반영됨"         1200 "$(field .total_seconds)"

# ============================================================================
section "규칙 변경 — 시작 전 그룹은 관리자가 바로 고친다"
# ============================================================================

rpc 1 create_group '{"group_name":"초안규칙"}'
GROUP_E=$(field .group.id)
CODE_E=$(field .group.invite_code)
rpc 2 join_group "{\"target_invite_code\":\"$CODE_E\"}" > /dev/null

rpc 1 propose_rule_change "{\"target_group_id\":\"$GROUP_E\"}"
check "시작 전에는 동의 절차를 쓰지 않음"  group_not_started "$(hint)"

rpc 2 update_draft_rule "{\"target_group_id\":\"$GROUP_E\",\"new_daily_limit_seconds\":3600}"
check "관리자가 아니면 수정 불가"          not_admin "$(hint)"

rpc 1 update_draft_rule "{\"target_group_id\":\"$GROUP_E\",\"new_daily_limit_seconds\":100}"
check "너무 짧은 한도 거부"                invalid_daily_limit "$(hint)"
rpc 1 update_draft_rule "{\"target_group_id\":\"$GROUP_E\",\"new_reset_hour\":24}"
check "범위 밖 초기화 시각 거부"           invalid_reset_hour "$(hint)"
rpc 1 update_draft_rule "{\"target_group_id\":\"$GROUP_E\",\"new_time_zone\":\"Mars/Phobos\"}"
check "알 수 없는 시간대 거부"             invalid_time_zone "$(hint)"

rpc 1 update_draft_rule "{\"target_group_id\":\"$GROUP_E\",\"new_daily_limit_seconds\":3600}"
DRAFT_RULE_FROM=$(field .rule.effective_from)
check "관리자 수정 성공"                   3600 "$(field .rule.daily_limit_seconds)"
check "버전을 쌓지 않고 덮어씀"            1 "$(field .rule.version)"

# 직전 경계로 다시 계산해 두므로 수정 즉시 유효하다. 시각 문자열을 셸에서
# 비교하면 표기가 달라 엉뚱한 답이 나오므로, 서버 함수와 맞춰 본다.
rpc 1 frimit_period_start "{\"at_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"time_zone\":\"Asia/Seoul\",\"reset_hour\":6}"
check "즉시 유효 (직전 경계로 계산됨)"     "$(jq -r . <<< "$CURL_BODY")" "$DRAFT_RULE_FROM"

# ============================================================================
section "규칙 변경 — 전원 동의"
#
# GROUP_B를 쓴다. t4(관리자)와 t5는 집계 중이고 t6은 다음 오전 6시부터 반영된다.
# t6이 동의 대상에 **들어가는 것**이 여기서 확인할 핵심이다 — 새 규칙 아래서
# 살게 될 사람이기 때문이다.
# ============================================================================

rpc 7 propose_rule_change "{\"target_group_id\":\"$GROUP_B\"}"
check "비멤버는 제안 불가"                 not_a_member "$(hint)"

rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\"}"
check "현재 규칙과 같으면 거부"            no_change "$(hint)"
rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":100}"
check "너무 짧은 한도 거부"                invalid_daily_limit "$(hint)"
rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_reset_hour\":24}"
check "범위 밖 초기화 시각 거부"           invalid_reset_hour "$(hint)"
rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_time_zone\":\"Mars/Phobos\"}"
check "알 수 없는 시간대 거부"             invalid_time_zone "$(hint)"

rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":10800}"
PROPOSAL=$(field .proposal.id)
check "제안 성공"                          pending "$(field .proposal.status)"
check "동의 대상 3명 (내일 오는 t6 포함)"  3 "$(field .required_count)"
check "제안은 곧 동의"                     approved "$(field .my_decision)"
check "남은 사람 2명"                      2 "$(field .pending_count)"
check "비교 기준이 현재 규칙"              900 "$(field .base_rule.daily_limit_seconds)"
check "아직 적용 예정 시각은 없음"         "" "$(field .proposal.effective_from)"

rpc 5 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":9000}"
check "그룹당 진행 중인 변경안은 하나"     proposal_exists "$(hint)"

rpc 7 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL\",\"approve\":true}"
check "비멤버는 응답 불가"                 not_a_member "$(hint)"

rpc 5 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL\",\"approve\":true}"
check "동의 반영"                          1 "$(field .pending_count)"
check "아직 전원은 아님"                   pending "$(field .proposal.status)"
rpc 5 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL\",\"approve\":true}"
check "두 번 응답 불가"                    already_decided "$(hint)"

rpc 4 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
check "동의가 모이는 중에는 한도 그대로"   900 "$(field .daily_limit_seconds)"

rpc 6 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL\",\"approve\":true}"
APPLY_AT=$(field .proposal.effective_from)
check "전원 동의로 승인됨"                 approved "$(field .proposal.status)"

rpc 6 frimit_next_period_start "{\"at_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"time_zone\":\"Asia/Seoul\",\"reset_hour\":6}"
check "적용 예정은 다음 오전 6시"          "$(jq -r . <<< "$CURL_BODY")" "$APPLY_AT"

svc GET "group_rules?group_id=eq.$GROUP_B&order=version&select=version,daily_limit_seconds,effective_from"
check "새 규칙 버전이 예약됨"              2 "$(jq -r 'length' <<< "$CURL_BODY")"
check "예약된 값이 변경안 그대로"          10800 "$(jq -r '.[1].daily_limit_seconds' <<< "$CURL_BODY")"
check "예약 시각이 적용 예정과 같음"       "$APPLY_AT" "$(jq -r '.[1].effective_from' <<< "$CURL_BODY")"

# 승인은 "지금부터"가 아니라 "다음 오전 6시부터"다. 진행 중인 하루의 공동 풀이
# 합의 직후에 흔들리면 오늘 남은 시간을 계산하던 사람들의 근거가 사라진다.
rpc 4 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
check "오늘의 한도는 그대로 900"           900 "$(field .daily_limit_seconds)"

rpc 5 current_rule_proposal "{\"target_group_id\":\"$GROUP_B\"}"
check "최근 변경안 조회"                   approved "$(field .proposal.status)"
rpc 9 current_rule_proposal "{\"target_group_id\":\"$GROUP_B\"}"
check "비멤버는 조회 불가"                 not_a_member "$(hint)"

# ============================================================================
section "규칙 변경 — 거절·철회·만료"
# ============================================================================

rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":5400}"
PROPOSAL2=$(field .proposal.id)
check "승인된 변경안이 다음 기준이 됨"     2 "$(field .proposal.base_version)"
check "비교 기준도 예약된 값"              10800 "$(field .base_rule.daily_limit_seconds)"

rpc 5 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL2\",\"approve\":false}"
check "한 명이 거절하면 즉시 종료"         rejected "$(field .proposal.status)"
rpc 6 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL2\",\"approve\":true}"
check "끝난 변경안에는 응답 불가"          proposal_not_pending "$(hint)"

svc GET "group_rules?group_id=eq.$GROUP_B&select=version"
check "거절된 변경안은 규칙을 만들지 않음" 2 "$(jq -r 'length' <<< "$CURL_BODY")"

rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":5400}"
PROPOSAL3=$(field .proposal.id)
rpc 5 withdraw_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL3\"}"
check "제안자도 관리자도 아니면 철회 불가" not_allowed "$(hint)"
rpc 4 withdraw_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL3\"}"
check "제안자는 철회 가능"                 withdrawn "$(field .proposal.status)"

# 48시간을 기다릴 수는 없으므로 만료 시각을 과거로 옮겨 둔다. 이 스키마에는
# 만료를 알려 줄 예약 작업이 없고, 판정은 누군가 이 변경안을 건드릴 때 일어난다.
rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":5400}"
PROPOSAL4=$(field .proposal.id)
svc PATCH "rule_proposals?id=eq.$PROPOSAL4" '{"expires_at":"2020-01-01T00:00:00Z"}'

rpc 5 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL4\",\"approve\":true}"
check "48시간이 지나면 동의해도 소용없음"  proposal_not_pending "$(hint)"
rpc 4 current_rule_proposal "{\"target_group_id\":\"$GROUP_B\"}"
check "조회하면 만료로 확정돼 있음"        expired "$(field .proposal.status)"

# ============================================================================
section "규칙 변경 — 명단은 낼 때 고정된다"
# ============================================================================

rpc 7 join_group "{\"target_invite_code\":\"$CODE_B\"}" > /dev/null

rpc 4 propose_rule_change "{\"target_group_id\":\"$GROUP_B\",\"proposed_daily_limit_seconds\":5400}"
PROPOSAL5=$(field .proposal.id)
check "만료된 자리는 비어 있음"            pending "$(field .proposal.status)"
check "낼 때의 멤버 4명이 대상"            4 "$(field .required_count)"

# 변경안이 만들어진 뒤에 들어온 사람은 대상이 아니다. 창 도중에 명단이 늘어나면
# 마지막 한 명이 동의하는 순간 새 멤버가 들어와 다시 미달이 되는 일이 생긴다.
rpc 8 join_group "{\"target_invite_code\":\"$CODE_B\"}" > /dev/null
rpc 8 respond_to_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL5\",\"approve\":true}"
check "나중에 들어온 사람은 대상 아님"     not_required "$(hint)"

rpc 4 withdraw_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL5\"}" > /dev/null

# ============================================================================
section "규칙 변경 — 직접 쓰기와 노출 범위"
# ============================================================================

post 4 rule_proposals "{\"group_id\":\"$GROUP_B\",\"proposer_id\":\"$(uid 4)\",\"daily_limit_seconds\":600,\"reset_hour\":6,\"time_zone\":\"Asia/Seoul\",\"base_version\":1,\"expires_at\":\"2030-01-01T00:00:00Z\"}"
check "변경안 직접 insert 차단"            403 "$CURL_CODE"
patch 4 "rule_proposals?id=eq.$PROPOSAL2" '{"status":"approved"}'
check "변경안 상태 직접 수정 차단"         403 "$CURL_CODE"
patch 6 "rule_approvals?proposal_id=eq.$PROPOSAL2" '{"decision":"approved"}'
check "동의 직접 수정 차단"                403 "$CURL_CODE"

call GET "$SB_URL/rest/v1/rule_proposals?group_id=eq.$GROUP_B&select=id" "$(jwt 5)" "$SB_ANON"
check "멤버는 변경안을 봄"                 yes "$([ "$(jq -r 'length' <<< "$CURL_BODY")" -gt 0 ] && echo yes || echo no)"
call GET "$SB_URL/rest/v1/rule_proposals?select=id" "$(jwt 9)" "$SB_ANON"
check "비멤버에게는 보이지 않음"           0 "$(jq -r 'length' <<< "$CURL_BODY")"
call GET "$SB_URL/rest/v1/rule_approvals?select=id" "$(jwt 9)" "$SB_ANON"
check "승인 상태도 비멤버에게는 안 보임"   0 "$(jq -r 'length' <<< "$CURL_BODY")"

rpc 4 settle_rule_proposal "{\"target_proposal_id\":\"$PROPOSAL2\"}"
check "판정 함수는 미노출"                 403 "$CURL_CODE"
rpc 4 rule_proposal_snapshot "{\"target_proposal_id\":\"$PROPOSAL2\",\"viewer_id\":\"$(uid 4)\"}"
check "변경안 스냅샷 헬퍼는 미노출"        403 "$CURL_CODE"
rpc 4 rule_voter_ids "{\"target_group_id\":\"$GROUP_B\"}"
check "동의 명단 헬퍼는 미노출"            403 "$CURL_CODE"
rpc 4 latest_rule "{\"target_group_id\":\"$GROUP_B\"}"
check "최신 규칙 헬퍼는 미노출"            403 "$CURL_CODE"

# ============================================================================
section "공동 목표 — 만들기"
#
# GROUP_B를 그대로 쓴다. 지금 멤버는 t4(관리자)·t5·t6·t7·t8 다섯이고, t7·t8은
# 다음 오전 6시부터 반영된다. 목표도 같은 경계에서 시작하므로 **다섯 명 전부**가
# 참여자가 되어야 한다 — 그게 "시작 시점의 멤버로 고정"의 실제 의미다.
# ============================================================================

rpc 9 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"침입\",\"target_amount\":5,\"goal_unit\":\"번\",\"duration_days\":7}"
check "비멤버는 목표 생성 불가"            not_a_member "$(hint)"

svc GET "groups?admin_id=eq.$(uid 9)&status=eq.draft&select=id&limit=1"
DRAFT_GROUP=$(jq -r '.[0].id' <<< "$CURL_BODY")
rpc 9 create_goal "{\"target_group_id\":\"$DRAFT_GROUP\",\"goal_title\":\"시작전\",\"target_amount\":5,\"goal_unit\":\"번\",\"duration_days\":7}"
check "시작 전 그룹에는 목표 불가"         group_not_active "$(hint)"

rpc 4 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"운동\",\"target_amount\":5,\"goal_unit\":\"번\",\"duration_days\":10}"
check "7·14·30일 아닌 기간 거부"           invalid_duration "$(hint)"
rpc 4 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"운동\",\"target_amount\":0,\"goal_unit\":\"번\",\"duration_days\":7}"
check "0 이하의 목표량 거부"               invalid_target_amount "$(hint)"
rpc 4 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"   \",\"target_amount\":5,\"goal_unit\":\"번\",\"duration_days\":7}"
check "공백뿐인 이름 거부"                 invalid_title "$(hint)"
rpc 4 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"운동\",\"target_amount\":5,\"goal_unit\":\"\",\"duration_days\":7}"
check "빈 단위 거부"                       invalid_unit "$(hint)"

rpc 4 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"이번 주 5번 운동하기\",\"target_amount\":5,\"goal_unit\":\"번\",\"duration_days\":7}"
GOAL=$(field .goal.id)
STARTS_AT=$(field .goal.starts_at)
check "목표 생성 성공"                     "이번 주 5번 운동하기" "$(field .goal.title)"
check "아직 시작하지 않음"                 false "$(field .started)"
check "진행률 0"                           0 "$(jq -r '.group_progress * 100 | round' <<< "$CURL_BODY")"
check "참여자 5명 (내일 오는 t7·t8 포함)"  5 "$(jq -r '.participants | length' <<< "$CURL_BODY")"
check "아무도 아직 적지 않음"              "" "$(field .my_entry)"

rpc 4 frimit_next_period_start "{\"at_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"time_zone\":\"Asia/Seoul\",\"reset_hour\":6}"
check "시작은 다음 오전 6시"               "$(jq -r . <<< "$CURL_BODY")" "$STARTS_AT"
svc GET "goals?id=eq.$GOAL&select=ends_at"
check "7일 뒤 오전 6시에 끝남"             "$(shift_days "$STARTS_AT" 7)" "$(jq -r '.[0].ends_at' <<< "$CURL_BODY")"

rpc 5 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"두 번째\",\"target_amount\":5,\"goal_unit\":\"번\",\"duration_days\":7}"
check "그룹당 살아 있는 목표는 하나"       goal_already_exists "$(hint)"

rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":1}"
check "시작 전에는 기록 불가"              goal_not_started "$(hint)"

# ============================================================================
section "공동 목표 — 기록"
#
# 시작 시각을 어제로 당겨 진행 중으로 만든다. 하루를 기다릴 수는 없고, 이
# 스키마에는 목표를 시작시켜 줄 예약 작업이 없다(시각 비교가 전부다).
# ============================================================================

svc PATCH "goals?id=eq.$GOAL" "{\"starts_at\":\"$(shift_days "$STARTS_AT" -2)\"}"

rpc 9 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":1}"
check "참여자가 아니면 기록 불가"          not_a_participant "$(hint)"
rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":0}"
check "0 이하의 기록 거부"                 invalid_amount "$(hint)"
rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":1,\"entry_note\":\"$(printf 'ㄱ%.0s' $(seq 41))\"}"
check "41자 메모 거부"                     note_too_long "$(hint)"

rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":3,\"entry_note\":\"아침 러닝\"}"
check "기록 성공"                          3 "$(jq -r '.my_entry.amount * 1' <<< "$CURL_BODY")"
check "메모도 함께"                        "아침 러닝" "$(field .my_entry.note)"
check "내 달성률 60%"                      60 "$(jq -r '[.participants[] | select(.ratio > 0)][0].ratio * 100 | round' <<< "$CURL_BODY")"
check "그룹 진행률은 다섯 명의 평균 12%"   12 "$(jq -r '.group_progress * 100 | round' <<< "$CURL_BODY")"

rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":2}"
check "같은 날 다시 적으면 덮어쓴다"       2 "$(jq -r '.my_entry.amount * 1' <<< "$CURL_BODY")"
check "메모도 함께 지워짐"                 "" "$(field .my_entry.note)"

# 한 사람이 열 배를 해도 나머지의 0을 메울 수 없다. 자르고 나서 평균이다.
rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":50}"
check "개인 달성률은 100%에서 잘린다"      100 "$(jq -r '[.participants[] | select(.ratio > 0)][0].ratio * 100 | round' <<< "$CURL_BODY")"
check "그래도 그룹은 20%"                  20 "$(jq -r '.group_progress * 100 | round' <<< "$CURL_BODY")"

rpc 5 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":5}"
check "둘이 채우면 40%"                    40 "$(jq -r '.group_progress * 100 | round' <<< "$CURL_BODY")"

rpc 6 current_goal "{\"target_group_id\":\"$GROUP_B\"}"
check "남의 기록은 내 칸에 안 들어옴"      "" "$(field .my_entry)"
check "진행률은 누가 보든 같다"            40 "$(jq -r '.group_progress * 100 | round' <<< "$CURL_BODY")"

rpc 5 delete_goal_entry "{\"target_goal_id\":\"$GOAL\"}"
check "오늘 기록 삭제"                     "" "$(field .my_entry)"
check "삭제하면 진행률도 되돌아감"         20 "$(jq -r '.group_progress * 100 | round' <<< "$CURL_BODY")"

svc GET "goal_entries?goal_id=eq.$GOAL&select=date_key,amount"
check "하루에 한 사람 한 줄"               1 "$(jq -r 'length' <<< "$CURL_BODY")"
rpc 4 frimit_date_key "{\"at_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"time_zone\":\"Asia/Seoul\",\"reset_hour\":6}"
DATE_KEY=$(jq -r . <<< "$CURL_BODY")
svc GET "goal_entries?goal_id=eq.$GOAL&select=date_key"
check "날짜는 자정이 아니라 오전 6시로 잘림" "$DATE_KEY" "$(jq -r '.[0].date_key' <<< "$CURL_BODY")"

# ============================================================================
section "공동 목표 — 끝, 취소, 조회"
# ============================================================================

rpc 4 current_goal "{\"target_group_id\":\"$GROUP_B\"}"
check "진행 중인 목표 조회"                "$GOAL" "$(field .goal.id)"
check "조회에도 시작 여부가 실린다"        true "$(field .started)"
rpc 9 current_goal "{\"target_group_id\":\"$GROUP_B\"}"
check "비멤버는 조회 불가"                 not_a_member "$(hint)"

svc PATCH "goals?id=eq.$GOAL" "{\"ends_at\":\"$(shift_days "$STARTS_AT" -1)\"}"
rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL\",\"entry_amount\":1}"
check "끝난 목표에는 기록 불가"            goal_ended "$(hint)"
rpc 4 current_goal "{\"target_group_id\":\"$GROUP_B\"}"
check "끝난 목표는 조회에서 빠짐"          "" "$(field .goal.id)"

rpc 5 create_goal "{\"target_group_id\":\"$GROUP_B\",\"goal_title\":\"물 마시기\",\"target_amount\":2,\"goal_unit\":\"L\",\"duration_days\":30}"
GOAL2=$(field .goal.id)
check "끝난 목표는 자리를 막지 않는다"     "물 마시기" "$(field .goal.title)"

rpc 6 cancel_goal "{\"target_goal_id\":\"$GOAL2\"}"
check "만든 사람도 관리자도 아니면 취소 불가" not_goal_owner "$(hint)"
rpc 4 cancel_goal "{\"target_goal_id\":\"$GOAL2\"}"
check "관리자는 취소 가능"                 yes "$([ -n "$(field .goal.cancelled_at)" ] && echo yes || echo no)"
rpc 4 current_goal "{\"target_group_id\":\"$GROUP_B\"}"
check "취소된 목표도 조회에서 빠짐"        "" "$(field .goal.id)"
rpc 4 record_goal_entry "{\"target_goal_id\":\"$GOAL2\",\"entry_amount\":1}"
check "취소된 목표에는 기록 불가"          goal_cancelled "$(hint)"

# ============================================================================
section "공동 목표 — 직접 쓰기와 노출 범위"
# ============================================================================

post 4 goals "{\"group_id\":\"$GROUP_B\",\"created_by\":\"$(uid 4)\",\"title\":\"몰래\",\"target_amount\":1,\"unit\":\"번\",\"duration_days\":7,\"starts_at\":\"2030-01-01T00:00:00Z\",\"ends_at\":\"2030-01-08T00:00:00Z\"}"
check "목표 직접 insert 차단"              403 "$CURL_CODE"
post 4 goal_participants "{\"goal_id\":\"$GOAL\",\"profile_id\":\"$(uid 9)\"}"
check "참여자 직접 추가 차단"              403 "$CURL_CODE"
post 4 goal_entries "{\"goal_id\":\"$GOAL\",\"profile_id\":\"$(uid 4)\",\"amount\":99,\"date_key\":\"2020-01-01\"}"
check "기록 직접 insert 차단"              403 "$CURL_CODE"
patch 4 "goals?id=eq.$GOAL" '{"target_amount":1}'
check "목표량 직접 수정 차단"              403 "$CURL_CODE"
patch 4 "goal_entries?goal_id=eq.$GOAL" '{"amount":999}'
check "기록 직접 수정 차단"                403 "$CURL_CODE"

call GET "$SB_URL/rest/v1/goals?group_id=eq.$GROUP_B&select=id" "$(jwt 5)" "$SB_ANON"
check "멤버는 목표를 봄"                   yes "$([ "$(jq -r 'length' <<< "$CURL_BODY")" -gt 0 ] && echo yes || echo no)"
call GET "$SB_URL/rest/v1/goals?select=id" "$(jwt 9)" "$SB_ANON"
check "비멤버에게는 보이지 않음"           0 "$(jq -r 'length' <<< "$CURL_BODY")"
call GET "$SB_URL/rest/v1/goal_entries?select=id" "$(jwt 9)" "$SB_ANON"
check "남의 기록도 비멤버에게는 안 보임"   0 "$(jq -r 'length' <<< "$CURL_BODY")"

rpc 4 goal_snapshot "{\"target_goal_id\":\"$GOAL\",\"viewer_id\":\"$(uid 4)\"}"
check "목표 스냅샷 헬퍼는 미노출"          403 "$CURL_CODE"
rpc 4 live_goal "{\"target_group_id\":\"$GROUP_B\"}"
check "살아 있는 목표 헬퍼는 미노출"       403 "$CURL_CODE"

# ============================================================================
section "활동 내역 — 사건은 트리거가 만든다"
#
# 여기까지 오는 동안 GROUP_B에서 실제로 일어난 일들이 그대로 쌓여 있어야 한다.
# 이 스크립트 전체가 이 섹션의 준비물이다 — 그룹 시작, 네 명의 가입, 한도 초과,
# 규칙 변경, 목표 하나와 그 기록들.
#
# 개수를 정확히 세지 않고 "있는가 / 한 번만 있는가"를 본다. 앞 섹션이 늘어나면
# 개수는 흔들리지만 사건의 성격은 흔들리지 않는다.
# ============================================================================

kinds() { # kinds <kind> → 그 종류의 사건 수
  svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.$1&select=id"
  jq -r 'length' <<< "$CURL_BODY"
}

check "그룹 시작이 남았다"                 1 "$(kinds group_started)"

svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.member_joined&select=actor_id"
check "가입한 네 명이 남았다"              4 "$(jq -r 'length' <<< "$CURL_BODY")"
# 관리자의 첫 멤버십은 create_group이 만드는 행이다. "내가 만든 그룹에 내가
# 들어왔어요"는 사건이 아니다.
check "그룹을 만든 사람은 가입 사건이 없다" no "$(jq -r --arg me "$(uid 4)" 'if any(.[]; .actor_id == $me) then "yes" else "no" end' <<< "$CURL_BODY")"

rpc 8 leave_group "{\"target_group_id\":\"$GROUP_B\"}" > /dev/null
check "탈퇴도 사건이다"                    1 "$(kinds member_left)"

svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.rule_changed&select=payload"
check "규칙 변경은 한 번만 (1번 버전은 사건이 아니다)" 1 "$(jq -r 'length' <<< "$CURL_BODY")"
check "바뀔 값이 payload에 있다"           10800 "$(jq -r '.[0].payload.daily_limit_seconds' <<< "$CURL_BODY")"

# 스냅샷은 몇 분마다 올라온다. 조건만 보면 같은 사건이 하루 종일 반복된다.
svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.pool_threshold&select=payload"
check "세 단계가 각각 한 번씩"             "[75,90,100]" "$(jq -c '[.[].payload.threshold] | sort' <<< "$CURL_BODY")"
check "초과도 하루 한 번"                  1 "$(kinds pool_over)"

svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.pool_over&select=payload"
check "넘긴 만큼이 payload에 있다"         150 "$(jq -r '.[0].payload.over_seconds' <<< "$CURL_BODY")"

check "목표를 건 것"                       2 "$(kinds goal_created)"
check "기록한 것"                          4 "$(kinds goal_entry)"
check "지운 것"                            1 "$(kinds goal_cleared)"
check "그만둔 것"                          1 "$(kinds goal_cancelled)"

svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.goal_entry&select=payload,actor_id&order=created_at.desc&limit=1"
check "기록 사건에 목표 제목이 실린다"     "이번 주 5번 운동하기" "$(jq -r '.[0].payload.title' <<< "$CURL_BODY")"
check "누가 적었는지도 남는다"             "$(uid 5)" "$(jq -r '.[0].actor_id' <<< "$CURL_BODY")"

# 한도 사건에는 주인이 없다. 많이 쓴 사람을 지목하는 순간 이 제품의 톤이 무너진다.
svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.pool_threshold&select=actor_id"
check "한도 사건에는 주인이 없다"          null "$(jq -r '.[0].actor_id' <<< "$CURL_BODY")"

# ============================================================================
section "활동 내역 — 직접 쓰기와 노출 범위"
# ============================================================================

post 4 activity_events "{\"group_id\":\"$GROUP_B\",\"actor_id\":\"$(uid 4)\",\"kind\":\"pool_over\",\"payload\":{}}"
check "사건 직접 insert 차단"              403 "$CURL_CODE"
patch 4 "activity_events?group_id=eq.$GROUP_B" '{"kind":"goal_entry"}'
check "사건 직접 수정 차단"                403 "$CURL_CODE"
call DELETE "$SB_URL/rest/v1/activity_events?group_id=eq.$GROUP_B" "$(jwt 4)" "$SB_ANON"
check "사건 직접 삭제 차단"                403 "$CURL_CODE"

call GET "$SB_URL/rest/v1/activity_events?group_id=eq.$GROUP_B&select=id" "$(jwt 5)" "$SB_ANON"
check "멤버는 활동을 봄"                   yes "$([ "$(jq -r 'length' <<< "$CURL_BODY")" -gt 0 ] && echo yes || echo no)"
call GET "$SB_URL/rest/v1/activity_events?select=id" "$(jwt 9)" "$SB_ANON"
check "비멤버에게는 보이지 않음"           0 "$(jq -r 'length' <<< "$CURL_BODY")"

# 화면이 문장을 만들려면 그룹 이름과 사람 이름이 같이 와야 한다. RPC 없이
# 임베드로 가져오는 경로가 실제로 열려 있는지 확인한다.
call GET "$SB_URL/rest/v1/activity_events?group_id=eq.$GROUP_B&select=id,kind,groups(name),profiles!activity_events_actor_id_fkey(nickname)&limit=1" "$(jwt 5)" "$SB_ANON"
check "그룹·사람 임베드가 열려 있다"       경계확인 "$(jq -r '.[0].groups.name' <<< "$CURL_BODY")"

rpc 4 log_activity "{\"target_group_id\":\"$GROUP_B\",\"actor\":null,\"event_kind\":\"pool_over\"}"
check "사건 기록 헬퍼는 미노출"            403 "$CURL_CODE"
rpc 4 purge_expired_activity
check "보관 정리는 예약 작업 전용"         403 "$CURL_CODE"

# ============================================================================
section "푸시 발송 — 집고 표시하기"
#
# 발송기(Edge Function)는 밖에서 주기적으로 부른다. 여기서 확인하는 것은 그
# 발송기가 기대는 두 가지다 — **누구에게 보낼지 서버가 정한다**는 것과, **한 사건은
# 한 번만 나간다**는 것.
# ============================================================================

# 활성 멤버 중 토큰이 있는 기기에만 간다. 지금 GROUP_B의 활성 멤버는 t4·t5뿐이고
# (t6~t8은 내일 6시부터다) 그중 t5에게만 토큰을 심는다.
svc PATCH "devices?id=eq.$DEV5" '{"expo_push_token":"ExponentPushToken[verify-db-test]"}'

reclaim "kind=in.(pool_threshold,pool_over)"
BATCH=$(jq -c --arg g 경계확인 '[.[] | select(.group_name == $g)]' <<< "$CURL_BODY")
check "한도 사건 넷이 집힌다"              4 "$(jq -r 'length' <<< "$BATCH")"
check "단계 셋과 초과 하나"                '["pool_over","pool_threshold"]' "$(jq -c '[.[].kind] | unique' <<< "$BATCH")"
check "75·90·100이 다 있다"                "[75,90,100]" "$(jq -c '[.[] | select(.kind == "pool_threshold") | .payload.threshold] | sort' <<< "$BATCH")"
check "토큰 가진 사람에게만 간다"          '["ExponentPushToken[verify-db-test]"]' "$(jq -c '[.[].tokens[]] | unique' <<< "$BATCH")"
check "문장 재료가 실려 온다"              yes "$(jq -r '[.[] | select(.kind == "pool_over") | .payload.over_seconds][0] | if . == 150 then "yes" else "no" end' <<< "$BATCH")"

svc POST "rpc/claim_push_batch" '{"max_events":50}'
check "집힌 사건은 다시 집히지 않는다"     0 "$(jq -r --arg g 경계확인 '[.[] | select(.group_name == $g)] | length' <<< "$CURL_BODY")"

# Expo가 잠깐 흔들렸다고 그날의 알림이 사라지면 안 된다.
svc POST "rpc/release_push_batch" "{\"event_ids\":$(jq -c '[.[].event_id]' <<< "$BATCH")}"
check "실패한 발송은 되돌릴 수 있다"       4 "$(jq -r . <<< "$CURL_BODY")"
svc POST "rpc/claim_push_batch" '{"max_events":50}'
check "되돌린 사건은 다시 집힌다"          4 "$(jq -r --arg g 경계확인 '[.[] | select(.group_name == $g)] | length' <<< "$CURL_BODY")"

svc POST "rpc/forget_push_token" '{"bad_token":"ExponentPushToken[verify-db-test]"}'
check "죽은 토큰은 비운다"                 1 "$(jq -r . <<< "$CURL_BODY")"
svc GET "devices?id=eq.$DEV5&select=id,expo_push_token,is_active"
check "기기 행은 지우지 않는다"            1 "$(jq -r 'length' <<< "$CURL_BODY")"
check "토큰만 비었다"                      null "$(jq -r '.[0].expo_push_token' <<< "$CURL_BODY")"
check "집계 기기로는 그대로 살아 있다"     true "$(jq -r '.[0].is_active' <<< "$CURL_BODY")"

rpc 4 claim_push_batch '{"max_events":10}'
check "발송 대상 조회는 미노출"            403 "$CURL_CODE"
rpc 4 release_push_batch '{"event_ids":[]}'
check "발송 표시 되돌리기도 미노출"        403 "$CURL_CODE"
rpc 4 forget_push_token '{"bad_token":"x"}'
check "남의 토큰은 건드릴 수 없다"         403 "$CURL_CODE"

call GET "$SB_URL/rest/v1/devices?select=expo_push_token" "$(jwt 5)" "$SB_ANON"
check "토큰은 본인 것만 보인다"            1 "$(jq -r 'length' <<< "$CURL_BODY")"

# ============================================================================
section "반응 — 사람당 하나, 정해진 세트"
# ============================================================================

svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.goal_entry&select=id&limit=1"
REACT_EVENT=$(jq -r '.[0].id' <<< "$CURL_BODY")

rpc 9 react_to_event "{\"target_event_id\":\"$REACT_EVENT\",\"reaction_emoji\":\"👏\"}"
check "비멤버는 반응 불가"                 event_not_visible "$(hint)"
rpc 5 react_to_event "{\"target_event_id\":\"$REACT_EVENT\",\"reaction_emoji\":\"💩\"}"
check "정해진 세트 밖은 거부"              emoji_not_allowed "$(hint)"

rpc 5 react_to_event "{\"target_event_id\":\"$REACT_EVENT\",\"reaction_emoji\":\"👏\"}"
check "반응 성공"                          👏 "$(field .emoji)"
rpc 5 react_to_event "{\"target_event_id\":\"$REACT_EVENT\",\"reaction_emoji\":\"🔥\"}"
check "다른 걸 누르면 바뀐다"              🔥 "$(field .emoji)"
svc GET "reactions?event_id=eq.$REACT_EVENT&select=emoji"
check "사람당 한 줄"                       1 "$(jq -r 'length' <<< "$CURL_BODY")"

rpc 5 react_to_event "{\"target_event_id\":\"$REACT_EVENT\",\"reaction_emoji\":\"🔥\"}"
check "같은 걸 또 누르면 취소"             "" "$(field .emoji)"
svc GET "reactions?event_id=eq.$REACT_EVENT&select=emoji"
check "취소하면 줄도 사라진다"             0 "$(jq -r 'length' <<< "$CURL_BODY")"

rpc 4 react_to_event "{\"target_event_id\":\"$REACT_EVENT\",\"reaction_emoji\":\"👀\"}" > /dev/null
post 5 reactions "{\"event_id\":\"$REACT_EVENT\",\"profile_id\":\"$(uid 5)\",\"emoji\":\"👏\"}"
check "반응 직접 insert 차단"              403 "$CURL_CODE"
call GET "$SB_URL/rest/v1/reactions?select=emoji" "$(jwt 9)" "$SB_ANON"
check "비멤버에게는 보이지 않음"           0 "$(jq -r 'length' <<< "$CURL_BODY")"

# 반응은 사건을 만들지 않는다. 만들면 세 사람이 한 번씩 누른 순간 피드가 반응으로 덮인다.
svc GET "activity_events?group_id=eq.$GROUP_B&select=id&kind=eq.nudge"
check "반응은 피드에 줄을 만들지 않는다"   0 "$(jq -r 'length' <<< "$CURL_BODY")"

# ============================================================================
section "콕 찌르기 — 상한은 서버가 센다"
#
# 지금 GROUP_B의 활성 멤버는 t4·t5뿐이다. t6~t8은 내일 6시부터라 아직 오늘의
# 공동 풀에 없고, 그래서 찌를 수도 없다.
# ============================================================================

rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 4)\"}"
check "자기 자신은 못 찌른다"              self_nudge "$(hint)"
rpc 9 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 5)\"}"
check "비멤버는 못 찌른다"                 not_a_member "$(hint)"
rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 9)\"}"
check "그룹에 없는 사람은 못 찌른다"       recipient_not_member "$(hint)"
rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 6)\"}"
check "내일 오는 사람도 아직은 못 찌른다"  recipient_not_member "$(hint)"

rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 5)\"}"
check "찌르기 성공"                        9 "$(field .remaining_today)"
rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 5)\"}"
check "30분 쿨다운"                        nudge_cooldown "$(hint)"

svc GET "activity_events?group_id=eq.$GROUP_B&kind=eq.nudge&select=actor_id,target_id,payload"
check "사건이 남는다"                      1 "$(jq -r 'length' <<< "$CURL_BODY")"
check "받는 사람이 표시된다"               "$(uid 5)" "$(jq -r '.[0].target_id' <<< "$CURL_BODY")"
check "그때의 이름이 박힌다"               yes "$(jq -r '.[0].payload | if has("sender_nickname") then "yes" else "no" end' <<< "$CURL_BODY")"

# 쿨다운을 지나게 하려면 기다리는 수밖에 없으므로 기록을 과거로 옮긴다.
svc PATCH "nudges?sender_id=eq.$(uid 4)&recipient_id=eq.$(uid 5)" '{"created_at":"2026-08-20T00:00:00Z"}'
rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 5)\"}"
check "쿨다운이 지나면 다시 된다"          8 "$(field .remaining_today)"

# 하루 10회. 쿨다운 검사가 먼저 걸리므로 지금까지의 기록을 전부 과거로 민 뒤,
# 오늘 몫을 여덟 번 더 채워 열 번을 만든다. 옮기는 시각은 오늘 오전 6시 이후여야
# 한다 — 그 전으로 밀면 어제 것이 되어 오늘로 세지 않는다. 구간 시작 직후로 두면
# 둘 다 만족한다(지금은 그로부터 몇 시간 뒤다).
OLD_NUDGE=$(shift_days "$PERIOD" 0.01)
svc PATCH "nudges?sender_id=eq.$(uid 4)&recipient_id=eq.$(uid 5)" "{\"created_at\":\"$OLD_NUDGE\"}"
svc POST "nudges" "$(jq -cn --arg g "$GROUP_B" --arg s "$(uid 4)" --arg r "$(uid 5)" --arg t "$OLD_NUDGE" \
  '[range(8) | {group_id: $g, sender_id: $s, recipient_id: $r, created_at: $t}]')"
svc GET "nudges?sender_id=eq.$(uid 4)&recipient_id=eq.$(uid 5)&select=id"
check "오늘 열 번을 채웠다"                10 "$(jq -r 'length' <<< "$CURL_BODY")"
rpc 4 send_nudge "{\"target_group_id\":\"$GROUP_B\",\"target_profile_id\":\"$(uid 5)\"}"
check "상대별 하루 10회"                   nudge_daily_limit "$(hint)"

post 4 nudges "{\"group_id\":\"$GROUP_B\",\"sender_id\":\"$(uid 4)\",\"recipient_id\":\"$(uid 5)\"}"
check "찌르기 직접 insert 차단"            403 "$CURL_CODE"
call GET "$SB_URL/rest/v1/nudges?select=id" "$(jwt 6)" "$SB_ANON"
check "남이 주고받은 것은 안 보인다"       0 "$(jq -r 'length' <<< "$CURL_BODY")"

# ============================================================================
section "콕 찌르기 — 푸시는 받는 사람에게만"
# ============================================================================

svc PATCH "devices?id=eq.$DEV4" '{"expo_push_token":"ExponentPushToken[sender-test]"}'
svc PATCH "devices?id=eq.$DEV5" '{"expo_push_token":"ExponentPushToken[recipient-test]"}'

reclaim "kind=eq.nudge"
NUDGE=$(jq -c '[.[] | select(.kind == "nudge")]' <<< "$CURL_BODY")
check "콕 찌르기도 발송 대상"              2 "$(jq -r 'length' <<< "$NUDGE")"
check "받는 사람에게만 간다"               '["ExponentPushToken[recipient-test]"]' "$(jq -c '[.[0].tokens[]]' <<< "$NUDGE")"

# 음소거는 콕 찌르기에만 걸린다. 한도 알림은 그룹의 사정이라 개인이 끄지 않는다.
patch 5 "group_memberships?group_id=eq.$GROUP_B&profile_id=eq.$(uid 5)" '{"notifications_muted":true}'
check "본인 음소거는 직접 켤 수 있다"      204 "$CURL_CODE"
# RLS는 조용히 0행을 고친다(에러가 아니다). 그러므로 응답이 아니라 값을 본다.
patch 5 "group_memberships?group_id=eq.$GROUP_B&profile_id=eq.$(uid 4)" '{"notifications_muted":true}'
svc GET "group_memberships?group_id=eq.$GROUP_B&profile_id=eq.$(uid 4)&select=notifications_muted"
check "남의 음소거는 못 켠다"              false "$(jq -r '.[0].notifications_muted' <<< "$CURL_BODY")"

reclaim "kind=eq.nudge"
check "음소거하면 안 간다"                 '[]' "$(jq -c '[.[] | select(.kind == "nudge")][0].tokens' <<< "$CURL_BODY")"

svc PATCH "devices?id=eq.$DEV4" '{"expo_push_token":null}'
svc PATCH "devices?id=eq.$DEV5" '{"expo_push_token":null}'

# ============================================================================
section "계정 삭제 — 관리자 자동 이전과 집계 보존"
#
# 되돌릴 수 없는 동작이라 확인할 것이 셋이다. 인증 정보가 실제로 사라지는가,
# 남은 사람들의 지난 집계가 그대로인가, 관리자 자리가 비지 않는가.
#
# GROUP_B의 관리자 t4를 지운다. 좌석이 셋(t5·t6·t7) 남으므로 보관되지 않고,
# 가장 먼저 들어온 t5에게 관리자가 넘어가야 한다.
# ============================================================================

rpc_anon delete_my_account
check "토큰 없이는 호출 불가"              401 "$CURL_CODE"

svc GET "daily_member_usage?group_id=eq.$GROUP_B&select=profile_id,cumulative_seconds"
BEFORE_TOTAL=$(jq -r '[.[].cumulative_seconds] | add' <<< "$CURL_BODY")
DEAD=$(uid 4)

rpc 4 delete_my_account
check "삭제 성공"                          200 "$CURL_CODE"
# t4는 GROUP_A(정원 시험에서 가입)와 GROUP_B 둘에 걸려 있다.
check "걸려 있던 그룹 둘을 정리"           2 "$(field .groups)"
check "관리자를 넘겼다"                    1 "$(field .transferred)"
check "보관된 그룹은 없다"                 0 "$(field .archived)"

svc GET "groups?id=eq.$GROUP_B&select=admin_id,status"
check "가장 먼저 들어온 사람이 관리자"     "$(uid 5)" "$(jq -r '.[0].admin_id' <<< "$CURL_BODY")"
check "그룹은 그대로 살아 있다"            active "$(jq -r '.[0].status' <<< "$CURL_BODY")"
svc GET "group_memberships?group_id=eq.$GROUP_B&profile_id=eq.$(uid 5)&select=role"
check "물려받은 사람의 역할도 바뀐다"      admin "$(jq -r '.[0].role' <<< "$CURL_BODY")"

# 오늘의 공동 풀은 이미 그 사람의 시간을 담고 있다. 지금 빼면 남은 사람들의
# 잔여가 갑자기 늘어난다.
svc GET "daily_member_usage?group_id=eq.$GROUP_B&select=cumulative_seconds"
check "지난 집계는 한 줄도 사라지지 않는다" "$BEFORE_TOTAL" "$(jq -r '[.[].cumulative_seconds] | add' <<< "$CURL_BODY")"
rpc 5 group_daily_usage "{\"target_group_id\":\"$GROUP_B\"}"
check "남은 사람이 보는 합계도 그대로"     "$BEFORE_TOTAL" "$(field .total_seconds)"
svc GET "group_memberships?group_id=eq.$GROUP_B&profile_id=eq.$DEAD&select=effective_until"
check "탈퇴는 다음 오전 6시로 예약"        yes "$(jq -r '.[0].effective_until | if . == null then "no" else "yes" end' <<< "$CURL_BODY")"

# 비석 — 행은 남지만 사람은 남지 않는다.
svc GET "profiles?id=eq.$DEAD&select=nickname,avatar_key,deleted_at"
check "프로필은 비석으로 남는다"           1 "$(jq -r 'length' <<< "$CURL_BODY")"
check "이름이 지워진다"                    "탈퇴한 멤버" "$(jq -r '.[0].nickname' <<< "$CURL_BODY")"
check "아바타도 기본값으로"                avatar-01 "$(jq -r '.[0].avatar_key' <<< "$CURL_BODY")"
check "지운 시각이 남는다"                 yes "$(jq -r '.[0].deleted_at | if . == null then "no" else "yes" end' <<< "$CURL_BODY")"

# 개인을 가리키는 것들은 남기지 않는다.
svc GET "devices?profile_id=eq.$DEAD&select=id"
check "기기는 지워진다"                    0 "$(jq -r 'length' <<< "$CURL_BODY")"
svc GET "usage_snapshots?profile_id=eq.$DEAD&select=id"
check "기기가 보낸 원본도 지워진다"        0 "$(jq -r 'length' <<< "$CURL_BODY")"
svc GET "reactions?profile_id=eq.$DEAD&select=id"
check "반응도 지워진다"                    0 "$(jq -r 'length' <<< "$CURL_BODY")"
svc GET "nudges?or=(sender_id.eq.$DEAD,recipient_id.eq.$DEAD)&select=id"
check "콕 찌르기 기록도 지워진다"          0 "$(jq -r 'length' <<< "$CURL_BODY")"

# 인증 정보.
curl -s "$SB_URL/auth/v1/admin/users?per_page=1000" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
  | jq -r '[.users[]? | select(.email == "t4@frimit.test")] | length' > "$TOKEN_DIR/t4-exists"
check "인증 정보가 사라진다"               0 "$(cat "$TOKEN_DIR/t4-exists")"

LOGIN=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"t4@frimit.test\",\"password\":\"$SB_TEST_PASSWORD\"}")
check "다시 로그인할 수 없다"              400 "$LOGIN"

# ============================================================================
section "계정 삭제 — 넘길 사람이 없으면 접는다"
#
# t9는 자기 혼자인 draft 그룹 다섯 개의 관리자다(정원 섹션에서 만들었다).
# 넘길 사람이 없으므로 다섯 개가 전부 보관되어야 한다.
# ============================================================================

LONER=$(uid 9)
rpc 9 delete_my_account
check "혼자인 그룹 다섯 개를 정리"         5 "$(field .groups)"
check "전부 보관됐다"                      5 "$(field .archived)"
check "넘긴 관리자는 없다"                 0 "$(field .transferred)"

svc GET "groups?admin_id=eq.$LONER&select=status"
check "남은 active 그룹이 없다"            0 "$(jq -r '[.[] | select(.status != "archived")] | length' <<< "$CURL_BODY")"

# 비석이 남은 계정은 cleanup이 auth 목록에서 찾지 못한다. 여기서 직접 치운다.
svc DELETE "groups?admin_id=eq.$LONER"
svc DELETE "profiles?id=eq.$LONER"
svc DELETE "profiles?id=eq.$DEAD"
svc GET "profiles?deleted_at=not.is.null&select=id"
check "시험이 남긴 비석을 치웠다"          0 "$(jq -r 'length' <<< "$CURL_BODY")"

# ============================================================================
printf '\n'
# ${VAR} 형태로 감쌀 것. `$PASS개`처럼 쓰면 bash가 한글 바이트까지 변수명으로 읽는다.
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 DB 검증 통과 (${PASS}개)"
  exit 0
fi
echo "💥 ${FAIL}개 실패 / ${PASS}개 통과"
exit 1
