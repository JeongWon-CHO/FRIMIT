import type { Seat } from '@/components/orbit';
import type { GroupAccentKey } from '@/constants/design-tokens';
import { avatarEmoji } from '@/lib/avatars';
import { formatPoolHeadline, formatSyncAge, formatShort, formatUsedPercent } from '@/lib/format';
import { hasStaleSync, poolState, type PoolState } from '@/lib/pool-state';
import type { GroupMember, MyGroup } from '@/lib/groups';
import type { GroupDailyUsage } from '@/lib/usage-sync';

/**
 * 서버가 주는 모양을 화면이 그리는 모양으로 옮긴다.
 *
 * 여기가 있는 이유는 **레이아웃을 데이터에 맞추지 않기 위해서**다. 디자인은
 * 히어로 하나 + 그리드를 전제하는데 서버는 동등한 그룹 목록을 준다. 그 차이를
 * 화면에서 흡수하면 화면마다 조금씩 다르게 흡수하게 되고, 상태가 여덟 개나
 * 되는 화면에서 그건 금방 무너진다.
 *
 * 이 파일에는 네트워크도 훅도 없다. 순수 변환만 있어서 실기기 없이 테스트된다.
 */

/**
 * 그룹 강조색.
 *
 * 서버 제약은 `color-NN`이고 디자인은 violet / cyan / pink 셋이다. 매핑으로
 * 해결한다 — 색 이름을 서버에 넣으려면 마이그레이션이 필요하고, 그건 이미
 * 돌아가는 그룹의 값을 건드리는 일이다.
 */
const ACCENT_BY_COLOR_KEY: Record<string, GroupAccentKey> = {
  'color-01': 'violet',
  'color-02': 'cyan',
  'color-03': 'pink',
};

const ACCENTS: GroupAccentKey[] = ['violet', 'cyan', 'pink'];

export function groupAccent(group: { id: string; color_key: string }): GroupAccentKey {
  const mapped = ACCENT_BY_COLOR_KEY[group.color_key];
  if (mapped) return mapped;

  // 예전 그룹은 전부 기본값 color-01이라 셋이 다 보라가 된다. 그리드가 한 색으로
  // 도장 찍힌 것처럼 보이는 것보다는 id에서 흩어 두는 편이 낫다.
  let sum = 0;
  for (let index = 0; index < group.id.length; index += 1) {
    sum = (sum + group.id.charCodeAt(index)) % 4096;
  }
  return ACCENTS[sum % ACCENTS.length];
}

export type PoolView = {
  groupId: string;
  groupName: string;
  accent: GroupAccentKey;
  state: PoolState;
  /** 늦은 멤버가 있다. 상태가 아니라 상태 위에 얹히는 겹이다. */
  stale: boolean;
  /** 게이지 스윕. 1을 넘지 않는다. */
  progress: number;
  limitSeconds: number;
  usedSeconds: number;
  overSeconds: number;
  /** 히어로의 큰 숫자 — `"3h 42m"` 또는 `"42m over"` */
  headline: string;
  /** `"of 8h shared today"` */
  sublabel: string;
  /** `"54% USED"` */
  percentLabel: string;
  /** `"Updated 2m ago"` */
  syncLabel: string;
  seats: Seat[];
  /** 푸터 오른쪽 — 오늘 가장 많이 쓴 사람 한 줄 */
  highlight: { name: string; label: string } | null;
  /** 동기화가 늦은 사람들. 히어로 안의 한 줄이 이 값을 쓴다. */
  staleMembers: { id: string; name: string; emoji: string; syncLabel: string }[];
  /** 등수 순서(덜 쓴 순). 그룹 상세가 쓴다. */
  ranking: RankedMember[];
};

export type RankedMember = {
  id: string;
  name: string;
  emoji: string;
  seconds: number;
  usageLabel: string;
  syncLabel: string;
  stale: boolean;
  isMe: boolean;
};

/**
 * 공동 풀 하나를 화면이 그릴 수 있는 값으로.
 *
 * `usage`가 없으면 아직 읽는 중이다 — 0으로 채워 그리면 "아무도 안 썼다"와
 * 구분되지 않으므로 `null`을 돌려주고 화면이 뼈대를 그린다.
 */
export function buildPoolView(
  group: MyGroup,
  usage: GroupDailyUsage | undefined,
  members: GroupMember[] | undefined,
  options: { permission: boolean; myProfileId?: string; now?: Date }
): PoolView | null {
  if (!usage) return null;

  const now = options.now ?? new Date();
  const limit = usage.daily_limit_seconds;
  const used = usage.total_seconds;
  const ratio = limit > 0 ? used / limit : 0;

  const state = poolState(ratio, usage.over_seconds, { permission: options.permission });
  const stale = hasStaleSync(
    usage.members.map((member) => member.last_collected_at),
    now,
    state
  );

  const byId = new Map((members ?? []).map((member) => [member.profile_id, member]));
  const named = usage.members.map((member) => {
    const profile = byId.get(member.profile_id);
    return {
      id: member.profile_id,
      // 멤버 목록이 아직 안 왔을 뿐인 경우가 대부분이라 행을 버리지 않는다.
      name: profile?.nickname ?? '…',
      emoji: avatarEmoji(profile?.avatar_key ?? 'avatar-01'),
      seconds: member.cumulative_seconds,
      lastCollectedAt: member.last_collected_at,
      isMe: member.profile_id === options.myProfileId,
    };
  });

  // 나를 12시에 놓는다. 링 위에서 자기 자리를 먼저 찾게 하는 것이 이 그래픽의 규칙이다.
  const seated = [...named].sort((left, right) => Number(right.isMe) - Number(left.isMe));

  const busiest = [...named].sort((left, right) => right.seconds - left.seconds)[0];

  return {
    groupId: group.id,
    groupName: group.name,
    accent: groupAccent(group),
    state,
    stale,
    progress: limit > 0 ? Math.min(1, ratio) : 0,
    limitSeconds: limit,
    usedSeconds: used,
    overSeconds: usage.over_seconds,
    headline: formatPoolHeadline(usage.remaining_seconds, usage.over_seconds),
    sublabel:
      usage.over_seconds > 0
        ? `of ${formatShort(limit)} shared today`
        : state === 'complete'
          ? `${formatShort(limit)} shared, all used`
          : `of ${formatShort(limit)} shared today`,
    percentLabel:
      state === 'permissionOff' ? 'NO DATA' : formatUsedPercent(used, limit, stale),
    syncLabel: formatSyncAge(latestSync(usage), now),
    seats: seated.map((member) => ({
      id: member.id,
      name: member.name,
      emoji: member.emoji,
      // 아직 한 번도 올리지 않은 사람은 빈 자리다 — 초대장이지 망신이 아니다.
      pending: member.lastCollectedAt === null,
      ring: member.isMe ? ('activity' as const) : ('none' as const),
    })),
    highlight:
      busiest && busiest.seconds > 0
        ? { name: busiest.name, label: formatShort(busiest.seconds) }
        : null,
    staleMembers: named
      .filter((member) => isStale(member.lastCollectedAt, now))
      .map((member) => ({
        id: member.id,
        name: member.name,
        emoji: member.emoji,
        syncLabel: formatSyncAge(member.lastCollectedAt, now),
      })),
    ranking: [...named]
      // **덜 쓴 순서.** 서버는 많이 쓴 사람부터 주므로 여기서 뒤집는다.
      .sort((left, right) => left.seconds - right.seconds)
      .map((member) => ({
        id: member.id,
        name: member.name,
        emoji: member.emoji,
        seconds: member.seconds,
        usageLabel: formatShort(member.seconds),
        syncLabel: formatSyncAge(member.lastCollectedAt, now),
        stale: isStale(member.lastCollectedAt, now),
        isMe: member.isMe,
      })),
  };
}

/** 그룹 전체의 마지막 동기화 = 가장 최근에 올라온 한 건. */
function latestSync(usage: GroupDailyUsage): string | null {
  const times = usage.members
    .map((member) => member.last_collected_at)
    .filter((iso): iso is string => iso !== null);

  if (times.length === 0) return null;
  return times.reduce((latest, iso) => (iso > latest ? iso : latest));
}

function isStale(iso: string | null, now: Date): boolean {
  return iso !== null && now.getTime() - new Date(iso).getTime() > 30 * 60 * 1000;
}

/**
 * 히어로에 올릴 그룹 하나를 고른다.
 *
 * 서버에는 "대표 그룹"이라는 개념이 없다 — 최대 5개가 동등하다. 사용자가 고른
 * 값이 있으면 그것을, 없으면 집계 중인 첫 그룹을 쓴다. 시작 전 그룹은 히어로에
 * 올리지 않는다: 그릴 숫자가 없고, 그 자리는 이 앱에서 가장 중요한 자리다.
 */
export function pickHeroGroup(groups: MyGroup[], preferredId?: string | null): MyGroup | null {
  if (groups.length === 0) return null;

  const preferred = preferredId
    ? groups.find((group) => group.id === preferredId)
    : undefined;
  if (preferred) return preferred;

  return groups.find((group) => group.status === 'active') ?? groups[0];
}
