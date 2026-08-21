#!/usr/bin/env bash
#
# 개발용 친구 한 명 — 혼자서는 볼 수 없는 화면들을 보기 위해
#
# 이 앱의 절반은 두 명 이상이어야 나타난다. 그룹 시작(준비 2명), 순위, 콕 찌르기,
# 공동 풀의 분모, 최근 7일 막대가 전부 그렇다. 실기기를 두 대 놓고 테스트할 수
# 없을 때 이 스크립트가 그 두 번째 사람이 된다.
#
# 실행:
#   bash scripts/seed-friend.sh <초대코드> [닉네임] [오늘_사용_분]
#
# 예:
#   bash scripts/seed-friend.sh 863308                # 가입 + 준비 완료
#   bash scripts/seed-friend.sh 863308 도형 45        # 그룹 시작 뒤, 45분 사용까지
#
# ⚠️ 링크된 원격 프로젝트에 **지우지 않고** 쓴다. verify-db.sh와 달리 정리 단계가
# 없다 — 남아 있어야 쓸모가 있기 때문이다. 계정은 friend@frimit.dev 하나이고,
# `t{숫자}@frimit.test` 규칙과 겹치지 않으므로 db:verify의 정리에 걸리지 않는다.

set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "❌ .env.local이 없습니다." >&2; exit 1; }
set -a; source .env.local; set +a
: "${SB_URL:?}"; : "${SB_ANON:?}"; : "${SB_SECRET:?}"
command -v jq > /dev/null || { echo "❌ jq가 필요합니다" >&2; exit 1; }

CODE="${1:-}"
NICKNAME="${2:-도형}"
MINUTES="${3:-0}"
[ -n "$CODE" ] || { echo "사용법: bash scripts/seed-friend.sh <초대코드> [닉네임] [분]" >&2; exit 1; }

EMAIL="friend@frimit.dev"
PASSWORD="${SB_TEST_PASSWORD:-frimit-test-1234}"

svc() { # svc <METHOD> <경로> [본문]
  curl -s -X "$1" "$SB_URL/rest/v1/$2" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    ${3:+-d "$3"}
}

# ── 계정 ──────────────────────────────────────────────────────────
# 이미 있으면 그대로 쓴다. 매번 새로 만들면 그룹마다 다른 친구가 생겨서, 어제
# 본 화면과 오늘 본 화면의 사람이 달라진다.
curl -s -o /dev/null -X POST "$SB_URL/auth/v1/admin/users" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"

JWT=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jq -r '.access_token // empty')

[ -n "$JWT" ] || { echo "❌ 친구 계정에 로그인하지 못했습니다." >&2; exit 1; }

as_friend() { # as_friend <METHOD> <경로> [본문]
  curl -s -X "$1" "$SB_URL/rest/v1/$2" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    ${3:+-d "$3"}
}
rpc() { as_friend POST "rpc/$1" "${2:-{\}}"; }

UID_FRIEND=$(curl -s "$SB_URL/auth/v1/user" -H "apikey: $SB_ANON" \
  -H "Authorization: Bearer $JWT" | jq -r '.id')

# 닉네임과 아바타. 이름이 '친구'로 남으면 순위 화면에서 누가 누군지 안 보인다.
as_friend PATCH "profiles?id=eq.$UID_FRIEND" \
  "{\"nickname\":\"$NICKNAME\",\"avatar_key\":\"avatar-05\"}" > /dev/null
echo "👤 $NICKNAME (${UID_FRIEND:0:8})"

# ── 가입 ──────────────────────────────────────────────────────────
JOIN=$(rpc join_group "{\"target_invite_code\":\"$CODE\"}")
HINT=$(jq -r '.hint // "ok"' <<< "$JOIN")

case "$HINT" in
  ok) GROUP=$(jq -r '.group.id' <<< "$JOIN"); echo "✅ 가입: $(jq -r '.group.name' <<< "$JOIN")";;
  already_member)
    GROUP=$(as_friend GET "groups?invite_code=eq.$CODE&select=id" | jq -r '.[0].id')
    echo "↩️  이미 멤버";;
  *) echo "❌ 가입 실패: $(jq -r '.message // .' <<< "$JOIN")" >&2; exit 1;;
esac

# ── 준비 완료 ─────────────────────────────────────────────────────
# 관리자가 그룹을 시작하려면 준비된 멤버가 2명 이상이어야 한다.
as_friend PATCH "group_memberships?group_id=eq.$GROUP&profile_id=eq.$UID_FRIEND" \
  '{"is_ready":true}' > /dev/null
echo "✅ 준비 완료"

# ── 기기 ──────────────────────────────────────────────────────────
# 사용량을 올리려면 활성 기기가 있어야 한다. 계정당 하나만 활성이므로 다시 켜 준다.
DEVICE=$(as_friend GET "devices?profile_id=eq.$UID_FRIEND&select=id" | jq -r '.[0].id // empty')
if [ -z "$DEVICE" ]; then
  DEVICE=$(as_friend POST devices \
    "{\"profile_id\":\"$UID_FRIEND\",\"platform\":\"ios\",\"permission_state\":\"granted\"}" \
    | jq -r '.[0].id')
else
  as_friend PATCH "devices?id=eq.$DEVICE" '{"is_active":true,"permission_state":"granted"}' > /dev/null
fi

# ── 사용량 ────────────────────────────────────────────────────────
STATUS=$(as_friend GET "groups?id=eq.$GROUP&select=status" | jq -r '.[0].status')

if [ "$MINUTES" -gt 0 ] && [ "$STATUS" = "active" ]; then
  USAGE=$(rpc group_daily_usage "{\"target_group_id\":\"$GROUP\"}")
  PERIOD=$(jq -r '.period_start' <<< "$USAGE")

  # 서버는 "흐른 시간보다 큰 누적값"을 거절한다. 구간이 시작된 지 얼마 안 됐으면
  # 그만큼으로 깎는다 — 아침 7시에 세 시간을 쓴 사람은 있을 수 없다.
  ELAPSED=$(python3 -c "
import datetime, sys
start = datetime.datetime.fromisoformat(sys.argv[1])
print(int((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds()))
" "$PERIOD")
  SECONDS_USED=$(( MINUTES * 60 ))
  [ "$SECONDS_USED" -gt "$ELAPSED" ] && SECONDS_USED=$(( ELAPSED - 60 ))

  RESULT=$(rpc record_usage_snapshot "{
    \"target_device_id\":\"$DEVICE\",
    \"target_group_id\":\"$GROUP\",
    \"period_start\":\"$PERIOD\",
    \"cumulative_seconds\":$SECONDS_USED,
    \"collected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"permission_state\":\"granted\",
    \"source\":\"ios-device-activity\",
    \"sequence\":$(date +%s)
  }")
  echo "⏱  사용량 $(( SECONDS_USED / 60 ))분 → $(jq -r '.status // .hint // .' <<< "$RESULT")"
elif [ "$MINUTES" -gt 0 ]; then
  echo "⏳ 아직 시작 전이라 사용량은 못 올린다. 앱에서 시작한 뒤 다시 실행할 것."
fi

echo
echo "다음: 앱에서 '우리 시간 시작하기'"
