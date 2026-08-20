import { describe, expect, it } from 'vitest';

import type { ActivityEvent, ActivityKind, ActivityPayload } from './activity';
import { groupByDay, toRow } from './activity-view';

// 서울 기준 2026-08-19 14:00. Frimit 일자로는 8월 19일.
const NOW = new Date('2026-08-19T05:00:00.000Z');

function event(
  kind: ActivityKind,
  payload: ActivityPayload = {},
  overrides: Partial<ActivityEvent> = {}
): ActivityEvent {
  return {
    id: `${kind}-${overrides.created_at ?? '1'}`,
    group_id: 'group-1',
    actor_id: 'me',
    kind,
    payload,
    created_at: '2026-08-19T04:00:00.000Z',
    group: { name: '밤샘 금지단', color_key: 'color-02' },
    actor: { nickname: '지호', avatar_key: 'avatar-03' },
    ...overrides,
  };
}

describe('문장', () => {
  const text = (e: ActivityEvent, me?: string) => toRow(e, me, NOW).text;

  it('한도 사건의 주어는 언제나 우리다 — 누가 썼는지 지목하지 않는다', () => {
    expect(text(event('pool_threshold', { threshold: 75 }))).toBe('우리 시간의 75%를 썼어요');
    expect(text(event('pool_threshold', { threshold: 90 }))).toBe('우리 시간의 90%를 썼어요');
  });

  it('100%는 퍼센트가 아니라 사실로 말한다', () => {
    expect(text(event('pool_threshold', { threshold: 100 }))).toBe('오늘 몫을 다 썼어요');
  });

  it('초과는 넘긴 만큼만 말한다', () => {
    expect(text(event('pool_over', { over_seconds: 4200 }))).toBe('1시간 10분 넘겼어요');
  });

  it('내 사건은 이름 대신 나 — "나 님이"는 사람이 쓰는 말이 아니다', () => {
    expect(text(event('goal_entry', { amount: 3, unit: '번' }), 'me')).toBe('내가 3번 기록했어요');
    expect(text(event('goal_entry', { amount: 3, unit: '번' }), 'other')).toBe(
      '지호 님이 3번 기록했어요'
    );
  });

  it('목표량은 정수로 — 3번이지 3.00번이 아니다', () => {
    expect(text(event('goal_entry', { amount: 3.0, unit: '번' }))).toBe('지호 님이 3번 기록했어요');
    expect(text(event('goal_entry', { amount: 2.5, unit: 'km' }))).toBe('지호 님이 2.5km 기록했어요');
  });

  it('탈퇴한 사람의 사건도 문장이 된다', () => {
    expect(text(event('member_left', {}, { actor: null }))).toBe('탈퇴한 멤버 님이 나갔어요');
  });

  it('규칙 변경은 바뀔 값을 말한다', () => {
    expect(text(event('rule_changed', { daily_limit_seconds: 10800 }))).toBe(
      '공동 시간이 3시간로 바뀌어요'
    );
  });

  it('모든 종류에 문장이 있다', () => {
    const kinds: ActivityKind[] = [
      'group_started',
      'member_joined',
      'member_left',
      'rule_changed',
      'pool_threshold',
      'pool_over',
      'goal_created',
      'goal_entry',
      'goal_cleared',
      'goal_cancelled',
    ];
    for (const kind of kinds) {
      expect(text(event(kind))).not.toBe('');
    }
  });
});

describe('아바타와 강조', () => {
  it('사람 없는 사건에는 아바타가 없다', () => {
    expect(toRow(event('pool_over', {}, { actor_id: null, actor: null }), 'me', NOW).actor).toBeNull();
  });

  it('공동 풀 사건만 보라로 들린다', () => {
    expect(toRow(event('pool_threshold'), 'me', NOW).emphasis).toBe('violet');
    expect(toRow(event('goal_entry'), 'me', NOW).emphasis).toBe('none');
  });
});

describe('groupByDay', () => {
  it('경계는 자정이 아니라 오전 6시 — 한 시간 차이로 날이 갈린다', () => {
    const days = groupByDay(
      [
        // 둘 다 달력으로는 8월 19일이지만, 오전 6시를 사이에 두고 갈린다.
        event('goal_entry', {}, { created_at: '2026-08-18T21:30:00.000Z' }), // 서울 19일 06:30
        event('pool_over', {}, { created_at: '2026-08-18T20:30:00.000Z' }), // 서울 19일 05:30
      ],
      'me',
      NOW
    );

    expect(days.map((day) => day.label)).toEqual(['오늘', '어제']);
  });

  it('날짜가 바뀌면 묶음이 갈린다', () => {
    const days = groupByDay(
      [
        event('goal_entry', {}, { created_at: '2026-08-19T04:00:00.000Z' }),
        event('goal_entry', {}, { created_at: '2026-08-18T04:00:00.000Z' }),
        event('goal_entry', {}, { created_at: '2026-08-15T04:00:00.000Z' }),
      ],
      'me',
      NOW
    );

    expect(days.map((day) => day.label)).toEqual(['오늘', '어제', '8월 15일']);
  });

  it('비어 있으면 묶음도 없다', () => {
    expect(groupByDay([], 'me', NOW)).toEqual([]);
  });
});
