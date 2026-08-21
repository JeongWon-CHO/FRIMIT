#!/usr/bin/env bash
#
# 개발용 지난 기록 — 그래프가 비어 있으면 그래프를 볼 수 없다
#
# 최근 7일 막대는 며칠 실제로 써 봐야 모양이 생긴다. 그때까지 기다리지 않고
# 높낮이가 다른 막대와 한도를 넘긴 날(분홍)을 지금 보기 위한 스크립트다.
#
# 실행:  bash scripts/seed-history.sh <초대코드>
#
# ⚠️ 개발 전용이고, **멤버십의 effective_from과 그룹의 started_at을 과거로 당긴다.**
# 이 제품이 가장 조심스럽게 다루는 필드다 — 지난 구간의 집계 대상이 그 값으로
# 정해지기 때문에, 당기지 않으면 심어 둔 사용량이 아무 날에도 잡히지 않는다.
# 실제 사용자 데이터가 있는 프로젝트에는 절대 돌리지 말 것.

set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "❌ .env.local이 없습니다." >&2; exit 1; }
set -a; source .env.local; set +a
: "${SB_URL:?}"; : "${SB_ANON:?}"; : "${SB_SECRET:?}"
command -v jq > /dev/null || { echo "❌ jq가 필요합니다" >&2; exit 1; }

CODE="${1:-}"
[ -n "$CODE" ] || { echo "사용법: bash scripts/seed-history.sh <초대코드>" >&2; exit 1; }

svc() { # svc <METHOD> <경로> [본문]
  curl -s -X "$1" "$SB_URL/rest/v1/$2" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
    -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    ${3:+-d "$3"}
}

GROUP=$(svc GET "groups?invite_code=eq.$CODE&select=id,name,started_at,status" | jq -r '.[0].id // empty')
[ -n "$GROUP" ] || { echo "❌ 그 코드의 그룹이 없습니다." >&2; exit 1; }

echo "📍 $(svc GET "groups?id=eq.$GROUP&select=name" | jq -r '.[0].name')"

# ── 구간 경계는 서버에게 묻는다 ────────────────────────────────────
# 오전 6시 경계를 여기서 다시 계산하면 서버와 어긋날 수 있다. `group_recent_days`가
# 이미 정확한 목록을 주므로 그걸 쓴다. 멤버가 아니면 못 부르니 친구 계정으로 묻는다.
JWT=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"friend@frimit.dev\",\"password\":\"${SB_TEST_PASSWORD:-frimit-test-1234}\"}" \
  | jq -r '.access_token // empty')
[ -n "$JWT" ] || { echo "❌ 친구 계정이 없습니다. 먼저 seed-friend.sh를 돌리세요." >&2; exit 1; }

recent_days() {
  curl -s -X POST "$SB_URL/rest/v1/rpc/group_recent_days" \
    -H "apikey: $SB_ANON" -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
    -d "{\"target_group_id\":\"$GROUP\"}"
}

OLDEST=$(recent_days | jq -r '.[0].period_start')

# ── 과거로 당긴다 ─────────────────────────────────────────────────
#
# 셋 다 당겨야 한다. 멤버십의 effective_from은 그날의 집계 대상을 정하고,
# **group_rules의 effective_from은 그날의 한도를 정한다.** 규칙을 두고 오면 지난
# 날들의 한도가 0으로 나와서 막대가 그려질 기준선이 없다.
svc PATCH "groups?id=eq.$GROUP" "{\"started_at\":\"$OLDEST\"}" > /dev/null
svc PATCH "group_memberships?group_id=eq.$GROUP" "{\"effective_from\":\"$OLDEST\"}" > /dev/null
svc PATCH "group_rules?group_id=eq.$GROUP&version=eq.1" "{\"effective_from\":\"$OLDEST\"}" > /dev/null
echo "⏪ 시작 시각·규칙을 $OLDEST 로"

# 당긴 뒤에 다시 읽는다. 위의 목록은 한도가 0이던 시절의 것이다.
DAYS=$(recent_days)

# ── 사용량 ────────────────────────────────────────────────────────
# 마지막 칸(오늘)은 건드리지 않는다. 실제로 올라오고 있는 값이다.
MEMBERS=$(svc GET "group_memberships?group_id=eq.$GROUP&select=profile_id" | jq -c '[.[].profile_id]')

ROWS=$(jq -cn --argjson days "$DAYS" --argjson members "$MEMBERS" --arg group "$GROUP" '
  # 한도 대비 비율. 화요일 하루는 일부러 넘긴다 — 분홍 막대를 봐야 한다.
  [0.62, 0.41, 0.94, 1.15, 0.50, 0.83] as $ratios
  | [ range(0; ($days | length) - 1) as $i
      | $days[$i] as $day
      | ($day.limit_seconds * $ratios[$i]) as $total
      | range(0; $members | length) as $m
      | {
          group_id: $group,
          profile_id: $members[$m],
          period_start: $day.period_start,
          date_key: $day.date_key,
          # 두 사람이 6:4로 나눠 쓴 것으로 둔다. 순위가 매일 같으면 재미없다.
          cumulative_seconds: (($total * (if ($i + $m) % 2 == 0 then 0.6 else 0.4 end)) | floor),
          last_collected_at: $day.period_start,
          last_sequence: 1,
          source: "ios-device-activity",
          permission_state: "granted"
        }
    ]')

# 이미 있으면 덮어쓴다. 같은 스크립트를 두 번 돌려도 값이 두 배가 되지 않는다.
#
# `on_conflict`를 명시해야 한다. 없으면 PostgREST가 기본키(id)로 판단하는데 우리는
# id를 보내지 않으므로, 중복을 만나면 병합 대신 오류가 난다 — 그것도 조용히.
INSERTED=$(curl -s -X POST "$SB_URL/rest/v1/daily_member_usage?on_conflict=group_id,profile_id,period_start" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
  -H 'Content-Type: application/json' \
  -H 'Prefer: resolution=merge-duplicates,return=minimal' \
  -w '%{http_code}' -o /dev/null -d "$ROWS")

case "$INSERTED" in
  2*) ;;
  *) echo "❌ 사용량을 심지 못했습니다 (HTTP $INSERTED)" >&2; exit 1;;
esac

echo "📊 $(jq 'length' <<< "$ROWS")줄 심음 (어제까지 6일 × 멤버)"
recent_days | jq -r '.[] | "  \(.date_key) · \(.total_seconds / 60 | floor)분 / 한도 \(.limit_seconds / 60 | floor)분"'
