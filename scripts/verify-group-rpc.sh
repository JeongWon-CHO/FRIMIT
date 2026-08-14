#!/usr/bin/env bash
#
# 그룹 수명주기 RPC(20260813000004_group_rpc.sql) 검증
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

rpc()      { call POST "$SB_URL/rest/v1/rpc/$2" "$(jwt "$1")" "$SB_ANON" "${3:-{\}}"; }
rpc_anon() { call POST "$SB_URL/rest/v1/rpc/$1" "" "$SB_ANON" "${2:-{\}}"; }
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
start_two_person_group() { # <관리자N> <멤버N> <이름>
  local admin="$1"
  local member="$2"
  local nm="$3"
  local gid code

  rpc "$admin" create_group "{\"group_name\":\"$nm\"}"
  gid=$(field .group.id)
  code=$(field .group.invite_code)

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

read -r GROUP_B CODE_B < <(start_two_person_group 4 5 "경계확인")

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
printf '\n'
# ${VAR} 형태로 감쌀 것. `$PASS개`처럼 쓰면 bash가 한글 바이트까지 변수명으로 읽는다.
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 그룹 RPC 검증 통과 (${PASS}개)"
  exit 0
fi
echo "💥 ${FAIL}개 실패 / ${PASS}개 통과"
exit 1
