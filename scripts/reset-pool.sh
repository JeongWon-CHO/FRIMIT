#!/usr/bin/env bash
#
# burn-pool.sh가 넣은 오늘 사용량을 되돌린다
#
# 검증이 끝나면 동반 계정이 태운 시간은 아무 의미가 없다. 그대로 두면 오늘 하루
# 내내 잔여 0으로 보이고, 활동 탭과 최근 7일에도 남는다.
#
# 지우는 것은 **동반 계정의 것뿐**이다. 내 폰이 올린 사용량은 진짜라 건드리지
# 않는다.
#
# 실행:
#   bash scripts/reset-pool.sh <초대코드>
#
# 잠금은 기기가 들고 있어서 서버를 지운다고 풀리지 않는다. Frimit을 한 번 열면
# 동기화가 잔여를 다시 알려 주고 그때 풀린다 — 급하면 스파이크 화면의 `차단 해제`.
#
# ⚠️ 원격 프로젝트의 오늘 집계를 실제로 지운다. 검증용 그룹에만 쓸 것.

set -uo pipefail

cd "$(dirname "$0")/.."

INVITE_CODE="${1:-}"
if [ -z "$INVITE_CODE" ]; then
  echo "사용법: bash scripts/reset-pool.sh <초대코드>" >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "❌ .env.local이 없습니다." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${SB_URL:?}"
: "${SB_ANON:?}"
: "${SB_SECRET:?}"
: "${SB_TEST_PASSWORD:=frimit-test-1234}"

svc() { curl -s -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" "$@"; }

GROUP_ID=$(svc "$SB_URL/rest/v1/groups?invite_code=eq.$INVITE_CODE&select=id" | jq -r '.[0].id // empty')
if [ -z "$GROUP_ID" ]; then
  echo "❌ 그 초대 코드의 그룹을 찾지 못했습니다: $INVITE_CODE" >&2
  exit 1
fi

# 동반 계정 목록. 이메일로 가른다 — 사람의 계정과 섞이지 않는 유일한 표시다.
COMPANIONS=$(svc "$SB_URL/auth/v1/admin/users?per_page=200" \
  | jq -r '[(.users // .)[] | select(.email | test("^companion[0-9]*@frimit\\.test$")) | .id] | join(",")')

if [ -z "$COMPANIONS" ]; then
  echo "❌ 동반 계정을 찾지 못했습니다." >&2
  exit 1
fi

# 오늘 구간의 경계. 서버에 묻는다 — 오전 6시 계산을 여기서 다시 하면 틀린다.
TOKEN=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"companion@frimit.test\",\"password\":\"$SB_TEST_PASSWORD\"}" | jq -r '.access_token // empty')

USAGE=$(curl -s -X POST "$SB_URL/rest/v1/rpc/group_daily_usage" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"target_group_id\":\"$GROUP_ID\"}")

PERIOD_START=$(jq -r '.period_start // empty' <<< "$USAGE")
DATE_KEY=$(jq -r '.date_key // empty' <<< "$USAGE")

if [ -z "$PERIOD_START" ]; then
  echo "❌ 구간을 읽지 못했습니다: $(jq -c '.' <<< "$USAGE")" >&2
  exit 1
fi

# 질의 문자열에 그대로 쓰면 `+09:00`의 `+`가 공백으로 해석돼 아무 행도 맞지
# 않는다. 지웠다고 말하면서 하나도 안 지우는 실패라 눈에 띄지도 않는다.
PERIOD_Q=${PERIOD_START//+/%2B}

echo "그룹 $GROUP_ID · $DATE_KEY"

# 확정 집계. 삭제는 트리거를 깨우지 않는다(after insert or update).
svc -X DELETE \
  "$SB_URL/rest/v1/daily_member_usage?group_id=eq.$GROUP_ID&period_start=eq.$PERIOD_Q&profile_id=in.($COMPANIONS)" -H 'Prefer: return=representation' | jq -r 'length' | xargs -I{} echo "   확정 집계 {}행 삭제"

# 원본 스냅샷도 지운다. 남겨 두면 나중에 이 값이 어디서 왔는지 헷갈린다.
svc -X DELETE \
  "$SB_URL/rest/v1/usage_snapshots?group_id=eq.$GROUP_ID&period_start=eq.$PERIOD_Q&profile_id=in.($COMPANIONS)" \
  -H 'Prefer: return=representation' | jq -r 'length' | xargs -I{} echo "   원본 스냅샷 {}행 삭제"

# 한도 사건. 지우지 않으면 활동 탭에 "다 썼어요"가 남고, 오늘 다시 태울 때
# dedupe_key에 걸려 알림이 안 나간다.
svc -o /dev/null -X DELETE \
  "$SB_URL/rest/v1/activity_events?group_id=eq.$GROUP_ID&date_key=eq.$DATE_KEY&kind=in.(pool_threshold,pool_over)"

AFTER=$(curl -s -X POST "$SB_URL/rest/v1/rpc/group_daily_usage" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"target_group_id\":\"$GROUP_ID\"}")

echo "✅ 동반 계정의 오늘 사용량과 한도 사건을 지웠습니다"
echo "   합계 $(jq -r '.total_seconds' <<< "$AFTER")초 · 잔여 $(jq -r '.remaining_seconds' <<< "$AFTER")초 · 초과 $(jq -r '.over_seconds' <<< "$AFTER")초"
echo
echo "잠금은 기기가 들고 있습니다. Frimit을 한 번 열면 동기화가 잔여를 다시"
echo "알려 주고 그때 풀립니다."
