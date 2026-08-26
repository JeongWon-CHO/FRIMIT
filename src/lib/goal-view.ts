import type { GroupAccentKey } from '@/constants/design-tokens';
import { avatarEmoji } from '@/lib/avatars';
import type { GoalSnapshot } from '@/lib/goals';
import type { MyGroup } from '@/lib/groups';
import { groupAccent } from '@/lib/today';

/**
 * 서버가 주는 목표를 화면이 그리는 모양으로 옮긴다.
 *
 * `today.ts`와 같은 이유로 따로 있다 — 네트워크도 훅도 없어서 실기기 없이
 * 테스트된다. 진행률은 서버가 이미 계산해 두었으므로 여기서는 자르고 조판만 한다.
 */


export type GoalView = {
  goalId: string;
  groupId: string;
  groupName: string;
  accent: GroupAccentKey;
  title: string;
  unit: string;
  targetAmount: number;
  /** 0..1 */
  progress: number;
  /** `"64%"` — 이 화면에서 가장 큰 글씨다. */
  percentLabel: string;
  /** `"7일 남음"`, 시작 전이면 `"내일 6시 시작"` */
  deadlineLabel: string;
  /** 남은 날. 히어로를 고르는 정렬 키다. */
  daysLeft: number;
  started: boolean;
  /** 끝난 목표다. 기록칸 대신 결과와 '새 목표 걸기'가 온다. */
  ended: boolean;
  members: {
    id: string;
    name: string;
    emoji: string;
    /** `"3 / 5번"` */
    countLabel: string;
    ratio: number;
    isMe: boolean;
  }[];
  /** 오늘 내가 적은 값. 입력칸의 초기값이다. */
  myAmountToday: number | null;
  /** 내가 참여자인가. 아니면 기록 입력칸을 그리지 않는다. */
  canRecord: boolean;
  /** 취소할 수 있는 사람을 화면이 가리려면 필요하다(만든 사람 또는 관리자). */
  createdBy: string;
};

/**
 * 남은 날.
 *
 * 끝 시각은 항상 그룹 시간대의 오전 6시라, 올림하면 "오늘을 포함해 며칠 더
 * 기록할 수 있는가"가 그대로 나온다. 마지막 날 오후에 0일이 뜨면 아직 기록할 수
 * 있는데 끝난 것처럼 보인다.
 */
export function daysLeft(endsAt: string, now: Date = new Date()): number {
  const remaining = new Date(endsAt).getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 86_400_000);
}

/** 목표량은 정수면 정수로 보여준다. `5번`이지 `5.00번`이 아니다. */
export function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
}

/**
 * 끝난 목표인가.
 *
 * 서버가 끝난 목표를 7일 동안 계속 주므로(0825 마이그레이션) 살아 있는 것과
 * 생김새가 같다. `daysLeft`가 0인 것만으로는 마지막 날 오후와 구분되지 않는다.
 */
export function isEnded(endsAt: string, now: Date = new Date()): boolean {
  return new Date(endsAt).getTime() <= now.getTime();
}

export function buildGoalView(
  group: MyGroup,
  snapshot: GoalSnapshot | null | undefined,
  myProfileId?: string,
  now: Date = new Date()
): GoalView | null {
  if (!snapshot) return null;

  const { goal } = snapshot;
  const left = daysLeft(goal.ends_at, now);

  const ended = isEnded(goal.ends_at, now);

  return {
    goalId: goal.id,
    groupId: goal.group_id,
    groupName: snapshot.group_name || group.name,
    accent: groupAccent(group),
    title: goal.title,
    unit: goal.unit,
    targetAmount: goal.target_amount,
    // 시작 전 목표의 진행률은 0이다. 서버도 그렇게 주지만, 참여자가 미리 기록할
    // 방법이 없으므로 여기서도 분명히 해 둔다.
    progress: snapshot.started ? clamp01(snapshot.group_progress) : 0,
    percentLabel: `${Math.round(clamp01(snapshot.group_progress) * 100)}%`,
    deadlineLabel: ended ? '끝났어요' : snapshot.started ? `${left}일 남음` : '내일 6시 시작',
    daysLeft: left,
    started: snapshot.started,
    ended,
    members: snapshot.participants.map((participant) => ({
      id: participant.profile_id,
      name: participant.nickname,
      emoji: avatarEmoji(participant.avatar_key),
      countLabel: `${formatAmount(participant.amount)} / ${formatAmount(goal.target_amount)}${goal.unit}`,
      ratio: clamp01(participant.ratio),
      isMe: participant.profile_id === myProfileId,
    })),
    myAmountToday: snapshot.my_entry?.amount ?? null,
    createdBy: goal.created_by,
    canRecord:
      snapshot.started &&
      !ended &&
      Boolean(myProfileId) &&
      snapshot.participants.some((participant) => participant.profile_id === myProfileId),
  };
}

/**
 * 히어로로 올릴 목표 하나를 고른다.
 *
 * 사용자가 카드를 눌러 지목했으면 그것. 아니면 **남은 날이 가장 적은 것** —
 * 오늘 신경 써야 하는 목표가 위에 있어야 한다.
 */
export function pickHeroGoal(views: GoalView[], preferredGroupId?: string | null): GoalView | null {
  if (views.length === 0) return null;

  const preferred = views.find((view) => view.groupId === preferredGroupId);
  if (preferred) return preferred;

  return [...views].sort((a, b) => {
    // 끝난 목표는 맨 뒤다. 오늘 적을 수 있는 목표가 하나라도 있으면 그것이 위다.
    if (a.ended !== b.ended) return a.ended ? 1 : -1;
    // 시작한 목표가 먼저다. 내일 시작할 목표는 오늘 할 일이 없다.
    if (a.started !== b.started) return a.started ? -1 : 1;
    return a.daysLeft - b.daysLeft;
  })[0];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
