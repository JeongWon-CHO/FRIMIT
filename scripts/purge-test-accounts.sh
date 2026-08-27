#!/usr/bin/env bash
#
# 검증용으로 만든 계정을 전부 지운다
#
# `join-test-member.sh`와 `burn-pool.sh`가 `companion@frimit.test`,
# `companion2@…` 같은 계정을 만들어 실제 그룹에 넣는다. 베타 전에 남아 있으면
# 사람이 아닌 멤버가 그룹 정원을 먹고, 공동 풀의 분모에도 들어간다.
#
# `verify-db.sh`가 쓰는 `t1~t9@frimit.test`도 함께 지운다. 그쪽은 스스로
# 정리하지만 중간에 죽으면 남는다.
#
# **`friend{N}@frimit.dev`는 기본으로 남긴다.** `seed-friend.sh`가 일부러 지우지
# 않는 계정이다 — 순위와 좌석은 여럿이 있어야 화면에 보이고, 그 사람들이 없으면
# 개발 중에 매번 다시 만들어야 한다. 베타 직전처럼 정말 비워야 할 때만
# `--include-seed`로 함께 지운다.
#
# 계정을 지우면 프로필·멤버십·사용량·기기가 전부 따라 지워진다
# (profiles가 auth.users를, 나머지가 profiles를 on delete cascade로 참조한다).
#
# 실행:
#   bash scripts/purge-test-accounts.sh                    # 보여주기만
#   bash scripts/purge-test-accounts.sh --yes               # 실제로 지우기
#   bash scripts/purge-test-accounts.sh --yes --include-seed  # seed 친구까지
#
# ⚠️ `@frimit.test`와 `@frimit.dev`만 건드린다. 사람의 계정은 그 도메인을 쓰지 않는다.

set -uo pipefail

cd "$(dirname "$0")/.."

CONFIRM=""
INCLUDE_SEED=0
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRM="--yes" ;;
    --include-seed) INCLUDE_SEED=1 ;;
    *) echo "❌ 모르는 인자: $arg" >&2; exit 1 ;;
  esac
done

if [ ! -f .env.local ]; then
  echo "❌ .env.local이 없습니다." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${SB_URL:?}"
: "${SB_SECRET:?}"

svc() { curl -s -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" "$@"; }

ALL=$(svc "$SB_URL/auth/v1/admin/users?per_page=500" \
  | jq -c '[(.users // .)[] | select(.email | test("@frimit\\.(test|dev)$")) | {id, email}]')

if [ "$INCLUDE_SEED" -eq 1 ]; then
  USERS=$ALL
else
  USERS=$(jq -c '[.[] | select(.email | endswith("@frimit.test"))]' <<< "$ALL")
  KEPT=$(jq -r '[.[] | select(.email | endswith("@frimit.dev"))] | length' <<< "$ALL")
fi

COUNT=$(jq -r 'length' <<< "$USERS")

if [ "$COUNT" -eq 0 ]; then
  echo "✅ 지울 검증용 계정이 없습니다."
  exit 0
fi

echo "검증용 계정 ${COUNT}개:"
jq -r '.[] | "   \(.email)"' <<< "$USERS"

# 어느 그룹에 들어가 있는지 함께 보여 준다. 그룹이 이 계정 때문에 정원이나
# 정족수를 채우고 있었다면, 지운 뒤 그 그룹의 상태가 달라진다.
IDS=$(jq -r '[.[].id] | join(",")' <<< "$USERS")
MEMBERSHIPS=$(svc "$SB_URL/rest/v1/group_memberships?profile_id=in.($IDS)&select=group_id,role,groups(name,status)")

if [ "$(jq -r 'length' <<< "$MEMBERSHIPS")" -gt 0 ]; then
  echo
  echo "이 계정들이 속한 그룹:"
  jq -r '.[] | "   \(.groups.name // "?") (\(.groups.status // "?")) · \(.role)"' <<< "$MEMBERSHIPS" | sort -u
fi

if [ "$INCLUDE_SEED" -eq 0 ] && [ "${KEPT:-0}" -gt 0 ]; then
  echo
  echo "남겨 두는 seed 친구 ${KEPT}명 (@frimit.dev · 순위와 좌석을 그리려면 필요합니다)"
  echo "   함께 지우려면 --include-seed"
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo
  echo "지우려면: bash scripts/purge-test-accounts.sh --yes"
  exit 0
fi

echo

# 관리자인 계정이 있으면 그룹이 관리자 없이 남는다. 지우기 전에 알린다 —
# 되돌릴 수 없는 일이고, 그 그룹은 규칙 변경과 시작을 할 사람이 없어진다.
ADMINS=$(jq -r '[.[] | select(.role == "admin")] | length' <<< "$MEMBERSHIPS")
if [ "$ADMINS" -gt 0 ]; then
  echo "⚠️ 관리자인 검증용 계정이 ${ADMINS}개 있습니다. 그 그룹은 관리자를 잃습니다."
fi

FAILED=0
while read -r id email; do
  code=$(svc -o /dev/null -w '%{http_code}' -X DELETE "$SB_URL/auth/v1/admin/users/$id")
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    echo "   지웠습니다 · $email"
  else
    echo "   ❌ 실패($code) · $email" >&2
    FAILED=$(( FAILED + 1 ))
  fi
done < <(jq -r '.[] | "\(.id) \(.email)"' <<< "$USERS")

echo
if [ "$FAILED" -gt 0 ]; then
  echo "❌ ${FAILED}개를 지우지 못했습니다." >&2
  exit 1
fi

echo "✅ 검증용 계정 ${COUNT}개를 지웠습니다. 프로필·멤버십·사용량·기기도 함께 사라집니다."
