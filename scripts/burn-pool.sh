#!/usr/bin/env bash
#
# 동반 계정들이 공동 풀을 다 태우게 한다 (I18~I20 검증용)
#
# 남이 풀을 태워 내 잔여가 0이 되는 경우는 **내 사용량이 1초도 늘지 않는다.**
# 그래서 임계값 콜백이 깨어나지 않고, 기기 혼자서는 잠글 수 없다. 그 자리를
# 한도 소진 알림이 메우는데(FrimitNotificationService), 그걸 확인하려면 남이
# 풀을 태우는 상황이 필요하다.
#
# 폰이 여러 대일 필요는 없다. 태우는 쪽이 할 일은 서버에 큰 누적값을 올리는
# 것뿐이고, 그건 Screen Time이 진짜가 아니어도 된다.
#
# 실행:
#   bash scripts/join-test-member.sh <초대코드>       # 아직 안 했다면 (참여 + 준비)
#   bash scripts/burn-pool.sh <초대코드> [지연초]
#
# **지연초를 주는 이유**: 이 검증에서 봐야 하는 그림은 "다른 앱을 쓰고 있는데
# 갑자기 잠기는 것"이다. 그런데 태우자마자 발송기가 1분 안에 돌아 버려서, 터미널
# 에서 엔터를 치고 폰을 집어 앱을 여는 사이에 이미 끝나 있다. 지연을 주면 준비를
# 먼저 끝내고 손을 뗀 채로 볼 수 있다.
#
#   bash scripts/burn-pool.sh 054573 30   # 30초 뒤에 태운다
#
# **왜 계정이 여럿인가**: 서버는 한 사람의 누적이 그 구간에서 흐른 시간을 넘지
# 못하게 막는다(0006, `elapsed + 900`). 오전 10시에 8시간짜리 풀을 혼자 태우려
# 들면 그 규칙에 걸린다 — 아직 네 시간밖에 안 흘렀기 때문이다. 규칙이 맞으므로
# 우회하지 않고, 모자란 만큼 동반 계정을 늘려 나눠 담는다.
#
# ⚠️ 원격 프로젝트의 오늘 집계를 실제로 바꾸고, 동반 계정의 반영 시각도 손본다.
#    검증용 그룹에만 쓸 것.

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

# 그룹 정원이 8명이다. 그보다 더 부르면 join_group이 거절한다.
MAX_COMPANIONS=6

svc() { curl -s -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" "$@"; }

GROUP_ID=$(svc "$SB_URL/rest/v1/groups?invite_code=eq.$INVITE_CODE&select=id" | jq -r '.[0].id // empty')

if [ -z "$GROUP_ID" ]; then
  echo "❌ 그 초대 코드의 그룹을 찾지 못했습니다: $INVITE_CODE" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 동반 계정 하나를 만들어 그룹에 넣는다.
#
# 첫 계정은 join-test-member.sh가 쓰는 것과 같다. 둘째부터는 여기서 만든다.
# 이메일·profile_id·토큰을 한 줄로 잇는다.
#
# 반영 시각은 여기서 손대지 않는다. 그 값은 오늘 구간의 시작이어야 하는데, 그걸
# 알려면 먼저 멤버가 되어 `group_daily_usage`를 부를 수 있어야 하기 때문이다.
# 순서가 뒤집히지 않게 `activate`로 따로 뺀다.
# ---------------------------------------------------------------------------
ensure_account() {
  local index="$1"
  local email token profile join hint

  if [ "$index" -eq 1 ]; then
    email="companion@frimit.test"
  else
    email="companion${index}@frimit.test"
  fi

  # 이미 있으면 422가 온다. 실패가 아니므로 그대로 넘어가 로그인한다.
  svc -o /dev/null -X POST "$SB_URL/auth/v1/admin/users" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$SB_TEST_PASSWORD\",\"email_confirm\":true}"

  token=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$SB_TEST_PASSWORD\"}" | jq -r '.access_token // empty')

  if [ -z "$token" ]; then
    echo "❌ $email 로 로그인하지 못했습니다." >&2
    return 1
  fi

  profile=$(curl -s "$SB_URL/auth/v1/user" -H "apikey: $SB_ANON" \
    -H "Authorization: Bearer $token" | jq -r '.id')

  join=$(curl -s -X POST "$SB_URL/rest/v1/rpc/join_group" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"target_invite_code\":\"$INVITE_CODE\"}")

  hint=$(jq -r '.hint // empty' <<< "$join")
  if [ -z "$(jq -r '.group.id // empty' <<< "$join")" ] && [ "$hint" != "already_member" ]; then
    echo "❌ $email 참여 실패: $(jq -r '.message // .' <<< "$join")" >&2
    return 1
  fi

  printf '%s %s %s\n' "$email" "$profile" "$token"
}

# ---------------------------------------------------------------------------
# 그 계정을 오늘 구간의 집계 대상으로 만든다.
#
# 시작 후 가입자는 다음 오전 6시부터 집계 대상이다(plan.md 35행). 그래서 오늘
# 올리면 `not_in_period`로 거절된다 — 규칙이 맞게 동작한 것이지 결함이 아니다.
# 검증은 내일까지 기다릴 수 없으므로 반영 시각만 오늘 구간 시작으로 당긴다.
# ---------------------------------------------------------------------------
activate() {
  svc -o /dev/null -X PATCH \
    "$SB_URL/rest/v1/group_memberships?group_id=eq.$GROUP_ID&profile_id=eq.$1" \
    -H 'Content-Type: application/json' \
    -d "{\"is_ready\":true,\"effective_from\":\"$PERIOD_START\",\"effective_until\":null}"
}

# ---------------------------------------------------------------------------
# 한 계정의 누적을 지정한 값으로 올린다.
# ---------------------------------------------------------------------------
post_usage() {
  local profile="$1" token="$2" value="$3" device result status

  device=$(curl -s "$SB_URL/rest/v1/devices?profile_id=eq.$profile&is_active=eq.true&select=id" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $token" | jq -r '.[0].id // empty')

  if [ -z "$device" ]; then
    device=$(curl -s -X POST "$SB_URL/rest/v1/devices" \
      -H "apikey: $SB_ANON" -H "Authorization: Bearer $token" \
      -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
      -d "{\"profile_id\":\"$profile\",\"platform\":\"ios\",\"permission_state\":\"granted\"}" \
      | jq -r '.[0].id // empty')
  fi

  if [ -z "$device" ]; then
    echo "❌ 기기를 만들지 못했습니다 ($profile)" >&2
    return 1
  fi

  result=$(curl -s -X POST "$SB_URL/rest/v1/rpc/record_usage_snapshots" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"snapshots\":[{
          \"device_id\":\"$device\",
          \"group_id\":\"$GROUP_ID\",
          \"period_start\":\"$PERIOD_START\",
          \"cumulative_seconds\":$value,
          \"collected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
          \"permission_state\":\"granted\",
          \"source\":\"ios-device-activity\",
          \"sequence\":$(date +%s)
        }]}")

  status=$(jq -r '.[0].status // empty' <<< "$result")
  if [ "$status" != "recorded" ]; then
    echo "❌ 올리지 못했습니다: $(jq -c '.' <<< "$result")" >&2
    return 1
  fi
}

read_usage() {
  curl -s -X POST "$SB_URL/rest/v1/rpc/group_daily_usage" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $1" \
    -H 'Content-Type: application/json' \
    -d "{\"target_group_id\":\"$GROUP_ID\"}"
}

# ---------------------------------------------------------------------------
# 경계와 한도. 오전 6시 계산을 여기서 다시 하면 서머타임에서 틀리고, 틀린
# period_start는 그대로 거절되므로 서버에 묻는다.
# ---------------------------------------------------------------------------
read -r FIRST_EMAIL FIRST_PROFILE FIRST_TOKEN <<< "$(ensure_account 1)" || exit 1

# 아직 반영 시각을 손대기 전이어도 이 호출은 된다 — 멤버 여부만 보고 반영 시각은
# 보지 않는다. 여기서 얻은 period_start이 곧 activate가 심을 값이다.
USAGE=$(read_usage "$FIRST_TOKEN")
PERIOD_START=$(jq -r '.period_start // empty' <<< "$USAGE")
DATE_KEY=$(jq -r '.date_key // empty' <<< "$USAGE")
LIMIT=$(jq -r '.daily_limit_seconds // empty' <<< "$USAGE")

if [ -z "$PERIOD_START" ] || [ -z "$LIMIT" ]; then
  echo "❌ 풀 상태를 읽지 못했습니다: $(jq -c '.' <<< "$USAGE")" >&2
  exit 1
fi

activate "$FIRST_PROFILE"

# 한 사람이 올릴 수 있는 최대치. 서버는 `흐른 시간 + 900`까지만 받는다(0006).
# 900을 다 쓰지 않고 여유를 남긴다 — 지연초 동안에도 시간은 흐르지만, 경계를
# 아슬아슬하게 밟아 거절당하는 것보다 한 사람이 조금 덜 담는 편이 낫다.
STAMP=$(sed -E 's/\.[0-9]+//; s/([+-][0-9]{2}):([0-9]{2})$/\1\2/; s/Z$/+0000/' <<< "$PERIOD_START")
START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$STAMP" +%s 2>/dev/null || date -d "$PERIOD_START" +%s)
ELAPSED=$(( $(date +%s) - START_EPOCH ))
CAP=$(( ELAPSED + 600 ))

if [ "$CAP" -le 0 ]; then
  echo "❌ 구간이 아직 시작되지 않았습니다." >&2
  exit 1
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
svc -o /dev/null -X DELETE \
  "$SB_URL/rest/v1/activity_events?group_id=eq.$GROUP_ID&date_key=eq.$DATE_KEY&kind=in.(pool_threshold,pool_over)"

# 한도를 1분 넘긴다. 정확히 닿으면 pool_threshold(100)만 나고, 넘겨야 pool_over도
# 함께 난다 — 둘 다 잠금을 지시하므로 한 번에 두 경로를 확인한다.
EMAIL="$FIRST_EMAIL"; PROFILE="$FIRST_PROFILE"; TOKEN="$FIRST_TOKEN"
INDEX=1

while [ "$INDEX" -le "$MAX_COMPANIONS" ]; do
  USAGE=$(read_usage "$FIRST_TOKEN")
  TOTAL=$(jq -r '.total_seconds // 0' <<< "$USAGE")
  DEFICIT=$(( LIMIT + 60 - TOTAL ))

  MINE=$(jq -r --arg me "$PROFILE" \
    '[.members[]? | select(.profile_id == $me) | .cumulative_seconds] | first // 0' <<< "$USAGE")

  # 확정값은 위로만 움직인다. 이미 다 찼어도 최소 1분은 올려야 트리거가 다시 돈다.
  if [ "$DEFICIT" -lt 60 ]; then DEFICIT=60; fi

  TAKE=$(( CAP - MINE ))
  if [ "$TAKE" -gt "$DEFICIT" ]; then TAKE="$DEFICIT"; fi

  if [ "$TAKE" -gt 0 ]; then
    post_usage "$PROFILE" "$TOKEN" "$(( MINE + TAKE ))" || exit 1
    echo "   $EMAIL → $(( MINE + TAKE ))초"
    DEFICIT=$(( DEFICIT - TAKE ))
  fi

  if [ "$DEFICIT" -le 0 ]; then break; fi

  # 이 사람은 상한까지 찼다. 남은 몫을 담을 계정을 하나 더 부른다.
  INDEX=$(( INDEX + 1 ))
  if [ "$INDEX" -gt "$MAX_COMPANIONS" ]; then
    echo "❌ 동반 계정 ${MAX_COMPANIONS}명으로도 모자랍니다 (${DEFICIT}초 남음)." >&2
    echo "   한 사람당 상한이 '흐른 시간 + 900초'라 이른 아침일수록 많이 필요합니다." >&2
    exit 1
  fi

  read -r EMAIL PROFILE TOKEN <<< "$(ensure_account "$INDEX")" || exit 1
  activate "$PROFILE"
done

AFTER=$(read_usage "$FIRST_TOKEN")

echo "✅ 한도 ${LIMIT}초 · 동반 계정 ${INDEX}명이 채웠습니다"
echo "   합계 $(jq -r '.total_seconds' <<< "$AFTER")초 · 잔여 $(jq -r '.remaining_seconds' <<< "$AFTER")초 · 초과 $(jq -r '.over_seconds' <<< "$AFTER")초"
echo
echo "발송기는 1분마다 돕니다. 그 안에 내 폰으로 알림이 오고,"
echo "알림이 뜨는 시점에 이미 앱이 잠겨 있어야 합니다."
