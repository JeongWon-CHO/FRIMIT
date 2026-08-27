#!/usr/bin/env bash
#
# 동반 계정이 공동 풀을 다 태우게 한다 (I18~I20 검증용)
#
# 남이 풀을 태워 내 잔여가 0이 되는 경우는 **내 사용량이 1초도 늘지 않는다.**
# 그래서 임계값 콜백이 깨어나지 않고, 기기 혼자서는 잠글 수 없다. 그 자리를
# 한도 소진 알림이 메우는데(FrimitNotificationService), 그걸 확인하려면 남이
# 풀을 태우는 상황이 필요하다.
#
# 폰이 두 대일 필요는 없다. B가 하는 일은 서버에 큰 누적값을 올리는 것뿐이고,
# 그건 Screen Time이 진짜가 아니어도 된다. `join-test-member.sh`가 쓰는 그
# 동반 계정으로 사용량만 올린다.
#
# 실행:
#   bash scripts/join-test-member.sh <초대코드>       # 아직 안 했다면 (참여 + 준비)
#   bash scripts/burn-pool.sh <초대코드> [지연초]
#
# 그 뒤 1분 안에 내 폰으로 "오늘 몫을 다 썼어요" 알림이 오고, 그 알림이 뜨는
# 시점에 이미 앱이 잠겨 있어야 한다.
#
# **지연초를 주는 이유**: 이 검증에서 봐야 하는 그림은 "다른 앱을 쓰고 있는데
# 갑자기 잠기는 것"이다. 그런데 태우자마자 발송기가 1분 안에 돌아 버려서, 터미널
# 에서 엔터를 치고 폰을 집어 앱을 여는 사이에 이미 끝나 있다. 지연을 주면 준비를
# 먼저 끝내고 손을 뗀 채로 볼 수 있다.
#
#   bash scripts/burn-pool.sh 054573 30   # 30초 뒤에 태운다
#
# ⚠️ 원격 프로젝트의 오늘 집계를 실제로 바꾼다. 검증용 그룹에만 쓸 것.

set -uo pipefail

cd "$(dirname "$0")/.."

INVITE_CODE="${1:-}"
DELAY="${2:-0}"

if [ -z "$INVITE_CODE" ]; then
  echo "사용법: bash scripts/burn-pool.sh <초대코드> [지연초]" >&2
  exit 1
fi

case "$DELAY" in
  ''|*[!0-9]*) echo "❌ 지연초는 숫자여야 합니다: $DELAY" >&2; exit 1 ;;
esac

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

EMAIL="companion@frimit.test"

TOKEN=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SB_TEST_PASSWORD\"}" | jq -r '.access_token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ 동반 계정으로 로그인하지 못했습니다. join-test-member.sh를 먼저 돌리세요." >&2
  exit 1
fi

PROFILE_ID=$(curl -s "$SB_URL/auth/v1/user" -H "apikey: $SB_ANON" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.id')

GROUP_ID=$(curl -s "$SB_URL/rest/v1/groups?invite_code=eq.$INVITE_CODE&select=id" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" | jq -r '.[0].id // empty')

if [ -z "$GROUP_ID" ]; then
  echo "❌ 그 초대 코드의 그룹을 찾지 못했습니다: $INVITE_CODE" >&2
  exit 1
fi

# 경계와 한도를 서버에 묻는다. 오전 6시 계산을 여기서 다시 하면 서머타임에서
# 틀리고, 틀린 period_start는 그대로 거절된다.
USAGE=$(curl -s -X POST "$SB_URL/rest/v1/rpc/group_daily_usage" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"target_group_id\":\"$GROUP_ID\"}")

PERIOD_START=$(jq -r '.period_start // empty' <<< "$USAGE")
DATE_KEY=$(jq -r '.date_key // empty' <<< "$USAGE")
LIMIT=$(jq -r '.daily_limit_seconds // empty' <<< "$USAGE")
TOTAL=$(jq -r '.total_seconds // 0' <<< "$USAGE")
MINE=$(jq -r --arg me "$PROFILE_ID" \
  '[.members[]? | select(.profile_id == $me) | .cumulative_seconds] | first // 0' <<< "$USAGE")

if [ -z "$PERIOD_START" ] || [ -z "$LIMIT" ]; then
  echo "❌ 풀 상태를 읽지 못했습니다: $(jq -c '.' <<< "$USAGE")" >&2
  exit 1
fi

# 시작 후 가입자는 **다음 오전 6시부터** 집계 대상이다(plan.md 35행). 그래서 오늘
# 올리면 `not_in_period`로 거절된다 — 규칙이 맞게 동작한 것이지 결함이 아니다.
#
# 검증은 내일까지 기다릴 수 없으므로 동반 계정의 반영 시각만 오늘 구간 시작으로
# 당긴다. 서비스 키로 테이블을 직접 고치는 유일한 자리이고, 이 스크립트가 검증용
# 그룹 전용인 이유이기도 하다.
MEMBERSHIP=$(curl -s "$SB_URL/rest/v1/group_memberships?group_id=eq.$GROUP_ID&profile_id=eq.$PROFILE_ID&select=effective_from,effective_until" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET")

if [ "$(jq -r 'length' <<< "$MEMBERSHIP")" != "1" ]; then
  echo "❌ 동반 계정이 이 그룹의 멤버가 아닙니다. join-test-member.sh를 먼저 돌리세요." >&2
  exit 1
fi

EFFECTIVE=$(jq -r '.[0].effective_from // empty' <<< "$MEMBERSHIP")
LEAVING=$(jq -r '.[0].effective_until // empty' <<< "$MEMBERSHIP")

# 반영이 아직 안 됐거나(비었거나 오늘 구간보다 뒤) 탈퇴가 예약돼 있으면 손본다.
# 시각 비교는 문자열로 한다 — 같은 그룹의 두 값이라 형식과 오프셋이 같다.
if [ -z "$EFFECTIVE" ] || [[ "$EFFECTIVE" > "$PERIOD_START" ]] || [ -n "$LEAVING" ]; then
  curl -s -o /dev/null -X PATCH \
    "$SB_URL/rest/v1/group_memberships?group_id=eq.$GROUP_ID&profile_id=eq.$PROFILE_ID" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"effective_from\":\"$PERIOD_START\",\"effective_until\":null}"

  echo "ℹ️  동반 계정의 반영 시각을 오늘 구간 시작으로 당겼습니다 (원래 ${EFFECTIVE:-미정})"

  # 멤버가 늘었으니 합계와 내 몫을 다시 읽는다. 옛 값으로 계산하면 태울 양이 틀린다.
  USAGE=$(curl -s -X POST "$SB_URL/rest/v1/rpc/group_daily_usage" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"target_group_id\":\"$GROUP_ID\"}")

  TOTAL=$(jq -r '.total_seconds // 0' <<< "$USAGE")
  MINE=$(jq -r --arg me "$PROFILE_ID" \
    '[.members[]? | select(.profile_id == $me) | .cumulative_seconds] | first // 0' <<< "$USAGE")
fi

# 동반 계정의 기기 행. 없으면 만든다 — 사용량은 기기 이름으로 올라간다.
DEVICE_ID=$(curl -s "$SB_URL/rest/v1/devices?profile_id=eq.$PROFILE_ID&is_active=eq.true&select=id" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')

if [ -z "$DEVICE_ID" ]; then
  DEVICE_ID=$(curl -s -X POST "$SB_URL/rest/v1/devices" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    -d "{\"profile_id\":\"$PROFILE_ID\",\"platform\":\"ios\",\"permission_state\":\"granted\"}" \
    | jq -r '.[0].id // empty')
fi

if [ -z "$DEVICE_ID" ]; then
  echo "❌ 동반 계정의 기기를 만들지 못했습니다." >&2
  exit 1
fi

# 한도를 1분 넘긴다. 정확히 닿으면 pool_threshold(100)만 나고, 넘겨야 pool_over도
# 함께 난다 — 둘 다 잠금을 지시하므로 한 번에 두 경로를 확인한다.
OTHERS=$((TOTAL - MINE))
TARGET=$((LIMIT - OTHERS + 60))

# 확정값은 위로만 움직인다. 다시 돌릴 때 값이 그대로면 아무 일도 일어나지 않으므로
# 최소한 1분은 올린다.
if [ "$TARGET" -le "$MINE" ]; then
  TARGET=$((MINE + 60))
fi

# 기다리는 자리는 여기다 — 준비가 전부 끝난 뒤.
#
# 앞쪽에서 기다리면 로그인이나 그룹 조회가 틀렸을 때 그 사실을 30초 뒤에야 알게
# 된다. 여기까지 왔다는 것은 남은 일이 올리는 것뿐이라는 뜻이다.
if [ "$DELAY" -gt 0 ]; then
  echo "⏳ ${DELAY}초 뒤에 태웁니다. 지금 폰에서 고른 앱을 여세요."
  sleep "$DELAY"
fi

# 같은 사건은 그룹당 하루 한 번이다(dedupe_key). 오늘 이미 한 번 태웠다면 알림이
# 다시 나가지 않으므로, 다시 재려면 그 사건을 지워야 한다. I19와 I20을 따로
# 재려면 두 번 돌려야 하고, 그래서 이 줄이 있다.
curl -s -o /dev/null -X DELETE \
  "$SB_URL/rest/v1/activity_events?group_id=eq.$GROUP_ID&date_key=eq.$DATE_KEY&kind=in.(pool_threshold,pool_over)" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"

RESULT=$(curl -s -X POST "$SB_URL/rest/v1/rpc/record_usage_snapshots" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"snapshots\":[{
        \"device_id\":\"$DEVICE_ID\",
        \"group_id\":\"$GROUP_ID\",
        \"period_start\":\"$PERIOD_START\",
        \"cumulative_seconds\":$TARGET,
        \"collected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"permission_state\":\"granted\",
        \"source\":\"ios-device-activity\",
        \"sequence\":$(date +%s)
      }]}")

STATUS=$(jq -r '.[0].status // empty' <<< "$RESULT")

if [ "$STATUS" != "recorded" ]; then
  echo "❌ 사용량을 올리지 못했습니다: $(jq -c '.' <<< "$RESULT")" >&2
  exit 1
fi

AFTER=$(curl -s -X POST "$SB_URL/rest/v1/rpc/group_daily_usage" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"target_group_id\":\"$GROUP_ID\"}")

echo "✅ 동반 계정이 ${TARGET}초를 올렸습니다 (한도 ${LIMIT}초)"
echo "   합계 $(jq -r '.total_seconds' <<< "$AFTER")초 · 잔여 $(jq -r '.remaining_seconds' <<< "$AFTER")초 · 초과 $(jq -r '.over_seconds' <<< "$AFTER")초"
echo
echo "발송기는 1분마다 돕니다. 그 안에 내 폰으로 알림이 오고,"
echo "알림이 뜨는 시점에 이미 앱이 잠겨 있어야 합니다."
