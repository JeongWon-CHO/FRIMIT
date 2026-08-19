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
    text: describe(event, name),
    timeLabel: formatSince(event.created_at, now),
    emphasis: event.kind === 'pool_threshold' || event.kind === 'pool_over' ? 'violet' : 'none',
  };
}

/**
 * 사건 한 줄의 문장.
 *
 * 조사는 전부 `님이`로 받는다. 이름 끝의 받침에 따라 이/가를 고르는 일을 하지
 * 않으려는 것이고, 존대가 한 겹 붙는 편이 서로를 부르는 톤에도 맞는다.
 */
function describe(event: ActivityEvent, name: string): string {
  const p = event.payload ?? {};

  switch (event.kind) {
    case 'group_started':
      return '우리 시간이 시작됐어요';
    case 'member_joined':
      return `${name} 님이 들어왔어요`;
    case 'member_left':
      return `${name} 님이 나갔어요`;
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
      return `${name} 님이 목표를 걸었어요 · ${p.title ?? ''}`;
    case 'goal_entry':
      return `${name} 님이 ${formatAmount(p.amount ?? 0)}${p.unit ?? ''} 기록했어요`;
    case 'goal_cleared':
      return `${name} 님이 오늘 기록을 지웠어요`;
    case 'goal_cancelled':
      return `목표를 그만뒀어요 · ${p.title ?? ''}`;
  }
}
