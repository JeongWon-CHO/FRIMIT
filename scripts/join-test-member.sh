#!/usr/bin/env bash
#
# 실기기 검증용 두 번째 멤버 채우기
#
# 그룹은 준비된 멤버가 2명 이상이어야 시작할 수 있다(plan.md 33행). 폰 한 대로
# 검증할 때는 이 조건 때문에 집계를 시작조차 못 한다. 그래서 테스트 계정 하나를
# 초대 코드로 참여시키고 준비 상태까지 켜 준다.
#
# 실행:
#   bash scripts/join-test-member.sh <초대코드>
#
# 그 뒤 앱에서 "그룹 시작"을 누르면 집계가 돈다. 이 계정은 사용량을 올리지 않으므로
# 공동 풀에는 기기의 값만 쌓인다.

set -uo pipefail

cd "$(dirname "$0")/.."

INVITE_CODE="${1:-}"
if [ -z "$INVITE_CODE" ]; then
  echo "사용법: bash scripts/join-test-member.sh <초대코드>" >&2
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

EMAIL="companion@frimit.test"

# 이미 있으면 422가 오는데, 그건 실패가 아니다. 아래에서 어차피 로그인해 본다.
curl -s -o /dev/null -X POST "$SB_URL/auth/v1/admin/users" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SB_TEST_PASSWORD\",\"email_confirm\":true}"

TOKEN=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SB_TEST_PASSWORD\"}" | jq -r '.access_token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ 동반 계정으로 로그인하지 못했습니다." >&2
  exit 1
fi

PROFILE_ID=$(curl -s "$SB_URL/auth/v1/user" -H "apikey: $SB_ANON" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.id')

JOIN=$(curl -s -X POST "$SB_URL/rest/v1/rpc/join_group" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"target_invite_code\":\"$INVITE_CODE\"}")

GROUP_ID=$(jq -r '.group.id // empty' <<< "$JOIN")
HINT=$(jq -r '.hint // empty' <<< "$JOIN")

# 이미 참여 중이면 그대로 진행한다 — 이 스크립트는 여러 번 돌려도 같은 결과여야 한다.
if [ -z "$GROUP_ID" ] && [ "$HINT" != "already_member" ]; then
  echo "❌ 참여 실패: $(jq -r '.message // .' <<< "$JOIN")" >&2
  exit 1
fi

if [ -z "$GROUP_ID" ]; then
  GROUP_ID=$(curl -s "$SB_URL/rest/v1/groups?invite_code=eq.$INVITE_CODE&select=id" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" | jq -r '.[0].id // empty')
fi

curl -s -o /dev/null -X PATCH \
  "$SB_URL/rest/v1/group_memberships?group_id=eq.$GROUP_ID&profile_id=eq.$PROFILE_ID" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"is_ready":true}'

READY=$(curl -s "$SB_URL/rest/v1/group_memberships?group_id=eq.$GROUP_ID&is_ready=eq.true&select=profile_id" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" | jq -r 'length')

echo "✅ $EMAIL 이 그룹에 참여하고 준비를 마쳤습니다"
echo "   그룹: $GROUP_ID"
echo "   준비된 멤버: ${READY}명"
if [ "$READY" -lt 2 ]; then
  echo "   ⚠️ 아직 2명이 안 됩니다. 앱에서 '준비 완료'를 먼저 누르세요."
fi
