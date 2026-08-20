import type { GroupAccentKey } from '@/constants/design-tokens';
import type { ActivityEvent, ActivityKind } from '@/lib/activity';
import { avatarEmoji } from '@/lib/avatars';
import { formatDateKey, formatDuration, formatSince } from '@/lib/format';
import { DEFAULT_TIME_ZONE, frimitDateKey } from '@/lib/frimit-day';
import { formatAmount } from '@/lib/goal-view';
import { groupAccent } from '@/lib/today';

/**
 * 사건을 문장으로.
 *
 * 서버는 `kind`와 재료만 준다. 문장이 여기 있는 이유는 카피가 바뀔 때 마이그레이션이
 * 필요하지 않아야 하고, 이미 저장된 옛 사건도 새 문구로 읽혀야 하기 때문이다.
 *
 * 규칙 하나: **비난하지 않는다.** 많이 쓴 사람을 지목하는 문장은 여기 없다.
 * 한도 관련 사건의 주어는 언제나 '우리'다(plan.md 18행).
 */

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  groupName: string;
  accent: GroupAccentKey;
  /** 아바타를 그릴 사람. 시스템 사건에는 없다. */
  actor: { id: string; name: string; emoji: string } | null;
  text: string;
  timeLabel: string;
  /** 공동 풀 사건은 보라 배경으로 한 겹 들린다(COMPONENT_SPEC §11). */
  emphasis: 'none' | 'violet';
  /** 같은 이모지끼리 접은 칩. 개수 많은 순. */
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export type ActivityDay = {
  /** `"오늘"`, `"어제"`, `"8월 17일"` */
  label: string;
  rows: ActivityRow[];
};

/**
 * 하루 단위로 묶는다.
 *
 * 경계는 자정이 아니라 오전 6시다 — 새벽 2시에 적은 기록은 어제의 흐름에 남아야
 * 한도 도달 사건과 같은 묶음에 들어간다. 시간대는 기기가 아니라 기본값(서울)을
 * 쓴다. 베타는 한국 시간대 하나이고(plan.md 8행), 그룹마다 다른 경계로 자르면
 * 통합 흐름의 날짜 구분선이 어느 그룹의 것인지 말할 수 없게 된다.
 */
export function groupByDay(
  events: ActivityEvent[],
  myProfileId?: string,
  now: Date = new Date()
): ActivityDay[] {
  const today = frimitDateKey(now, DEFAULT_TIME_ZONE);
  const yesterday = frimitDateKey(new Date(now.getTime() - 86_400_000), DEFAULT_TIME_ZONE);

  const days: ActivityDay[] = [];

  for (const event of events) {
    const key = frimitDateKey(new Date(event.created_at), DEFAULT_TIME_ZONE);
    const label = key === today ? '오늘' : key === yesterday ? '어제' : formatDateKey(key);

    // 사건은 이미 최신순으로 정렬되어 온다. 같은 날이면 마지막 묶음에 붙이고,
    // 날짜가 바뀌면 새 묶음을 연다.
    if (days[days.length - 1]?.label !== label) {
      days.push({ label, rows: [] });
    }

    days[days.length - 1].rows.push(toRow(event, myProfileId, now));
  }

  return days;
}

export function toRow(event: ActivityEvent, myProfileId?: string, now: Date = new Date()): ActivityRow {
  const isMine = Boolean(event.actor_id) && event.actor_id === myProfileId;
  const name = isMine ? '나' : (event.actor?.nickname ?? '탈퇴한 멤버');
  // 남은 "지호 님이", 나는 "내가". '나 님이'는 사람이 쓰는 말이 아니다.
  const subject = isMine ? '내가' : `${name} 님이`;

  return {
    id: event.id,
    kind: event.kind,
    groupName: event.group?.name ?? '',
    accent: groupAccent({ id: event.group_id, color_key: event.group?.color_key ?? '' }),
    actor: event.actor_id
      ? {
          id: event.actor_id,
          name,
          emoji: avatarEmoji(event.actor?.avatar_key ?? 'avatar-01'),
        }
      : null,
    text: describe(event, subject, myProfileId),
    timeLabel: formatSince(event.created_at, now),
    emphasis: event.kind === 'pool_threshold' || event.kind === 'pool_over' ? 'violet' : 'none',
    reactions: foldReactions(event.reactions, myProfileId),
  };
}

/**
 * 같은 이모지끼리 접는다.
 *
 * 사람당 반응은 하나라(0011) 한 사람이 두 칩에 걸리는 일은 없다. `mine`은 그
 * 칩을 강조해 "내가 누른 것"을 보여주는 데 쓰고, 다시 누르면 취소된다.
 */
function foldReactions(
  reactions: { emoji: string; profile_id: string }[],
  myProfileId?: string
): { emoji: string; count: number; mine: boolean }[] {
  const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();

  for (const reaction of reactions) {
    const chip = counts.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
    chip.count += 1;
    chip.mine = chip.mine || reaction.profile_id === myProfileId;
    counts.set(reaction.emoji, chip);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

/**
 * 사건 한 줄의 문장.
 *
 * 주어는 이미 만들어져 들어온다("지호 님이" / "내가"). 조사를 `님이`로 받는 것은
 * 이름 끝의 받침에 따라 이/가를 고르지 않으려는 것이고, 존대가 한 겹 붙는 편이
 * 서로를 부르는 톤에도 맞는다.
 */
function describe(event: ActivityEvent, subject: string, myProfileId?: string): string {
  const p = event.payload ?? {};

  switch (event.kind) {
    case 'group_started':
      return '우리 시간이 시작됐어요';
    case 'member_joined':
      return `${subject} 들어왔어요`;
    case 'member_left':
      return `${subject} 나갔어요`;
    case 'rule_changed':
      return p.daily_limit_seconds
        ? `공동 시간이 ${formatDuration(p.daily_limit_seconds)}로 바뀌어요`
        : '공동 규칙이 바뀌어요';

    case 'pool_threshold':
      // 100%는 퍼센트로 말하지 않는다. 숫자보다 "오늘 몫을 다 썼다"가 먼저 읽혀야 한다.
      return p.threshold === 100
        ? '오늘 몫을 다 썼어요'
        : `우리 시간의 ${p.threshold ?? 0}%를 썼어요`;
    case 'pool_over':
      return `${formatDuration(p.over_seconds ?? 0)} 넘겼어요`;

    case 'goal_created':
      return `${subject} 목표를 걸었어요 · ${p.title ?? ''}`;
    case 'goal_entry':
      return `${subject} ${formatAmount(p.amount ?? 0)}${p.unit ?? ''} 기록했어요`;
    case 'goal_cleared':
      return `${subject} 오늘 기록을 지웠어요`;
    case 'goal_cancelled':
      return `목표를 그만뒀어요 · ${p.title ?? ''}`;

    case 'nudge':
      // 받는 사람 입장에서는 "나를"이 먼저 읽혀야 한다. 이 줄은 그 사람에게
      // 푸시로도 갔으므로, 피드에서 같은 사건을 다시 알아볼 수 있어야 한다.
      return p.recipient_id === myProfileId
        ? `${subject} 나를 콕 찔렀어요 👀`
        : `${subject} ${p.recipient_nickname ?? '친구'} 님을 콕 찔렀어요 👀`;
  }

  /*
   * 여기 닿으면 종류를 더하면서 문장을 빠뜨린 것이다. `never`에 넣어 두면
   * 컴파일이 먼저 막는다 — 화면에 undefined가 뜨고 나서 알게 되지 않는다.
   */
  const unhandled: never = event.kind;
  return unhandled;
}
