import { describe, expect, it } from 'vitest';

import { buildGoalView, daysLeft, formatAmount, pickHeroGoal } from './goal-view';
import type { GoalSnapshot } from './goals';
import type { MyGroup } from './groups';

const NOW = new Date('2026-08-19T05:00:00.000Z'); // 서울 14:00

const group: MyGroup = {
  id: 'group-1',
  name: '밤샘 금지단',
  status: 'active',
  invite_code: '123456',
  icon_key: 'icon-01',
  color_key: 'color-02',
  admin_id: 'me',
  started_at: '2026-08-01T21:00:00.000Z',
  time_zone: 'Asia/Seoul',
};

function snapshot(overrides: Partial<GoalSnapshot> = {}): GoalSnapshot {
  return {
    goal: {
      id: 'goal-1',
      group_id: 'group-1',
      title: '이번 주 5번 운동하기',
      target_amount: 5,
      unit: '번',
      duration_days: 7,
      starts_at: '2026-08-18T21:00:00.000Z',
      ends_at: '2026-08-25T21:00:00.000Z',
      cancelled_at: null,
      created_by: 'me',
    },
    group_name: '밤샘 금지단',
    date_key: '2026-08-19',
    started: true,
    group_progress: 0.5,
    participants: [
      { profile_id: 'me', nickname: '우', avatar_key: 'avatar-02', amount: 5, ratio: 1 },
      { profile_id: 'friend', nickname: '도형', avatar_key: 'avatar-03', amount: 0, ratio: 0 },
    ],
    my_entry: null,
    ...overrides,
  };
}

describe('daysLeft', () => {
  it('마지막 날 오후에도 하루가 남아 있다 — 아직 기록할 수 있다', () => {
    // 끝나기 7시간 전. 내림하면 0일이 되어 끝난 것처럼 보인다.
    expect(daysLeft('2026-08-19T12:00:00.000Z', NOW)).toBe(1);
  });

  it('경계', () => {
    expect(daysLeft('2026-08-25T21:00:00.000Z', NOW)).toBe(7);
    expect(daysLeft('2026-08-19T05:00:00.000Z', NOW)).toBe(0);
    expect(daysLeft('2026-08-01T00:00:00.000Z', NOW)).toBe(0);
  });
});

describe('buildGoalView', () => {
  it('서버가 이미 자른 진행률을 그대로 쓴다', () => {
    const view = buildGoalView(group, snapshot(), 'me', NOW)!;
    expect(view.progress).toBe(0.5);
    expect(view.percentLabel).toBe('50%');
    expect(view.deadlineLabel).toBe('7일 남음');
  });

  it('서버가 이상한 값을 줘도 게이지는 0..1을 벗어나지 않는다', () => {
    const over = buildGoalView(group, snapshot({ group_progress: 1.4 }), 'me', NOW)!;
    expect(over.progress).toBe(1);

    const nan = buildGoalView(group, snapshot({ group_progress: Number.NaN }), 'me', NOW)!;
    expect(nan.progress).toBe(0);
  });

  it('시작 전 목표는 진행률이 아니라 시작 시각을 말하고, 기록도 받지 않는다', () => {
    const view = buildGoalView(group, snapshot({ started: false }), 'me', NOW)!;
    expect(view.progress).toBe(0);
    expect(view.deadlineLabel).toBe('내일 6시 시작');
    expect(view.canRecord).toBe(false);
  });

  it('참여자가 아니면 기록칸이 없다 — 중간 가입자는 다음 목표부터다', () => {
    const view = buildGoalView(group, snapshot(), 'newcomer', NOW)!;
    expect(view.canRecord).toBe(false);
    expect(view.members.every((member) => !member.isMe)).toBe(true);
  });

  it('멤버 줄은 "한 / 목표단위"로 읽힌다', () => {
    const view = buildGoalView(group, snapshot(), 'me', NOW)!;
    expect(view.members[0].countLabel).toBe('5 / 5번');
  });

  it('끝난 목표는 결과만 남는다 — 기록칸도 남은 날도 없다', () => {
    // 서버가 끝난 뒤 7일 동안 계속 준다. 마지막 날 오후와 헷갈리면 안 된다.
    const view = buildGoalView(
      group,
      snapshot({ goal: { ...snapshot().goal, ends_at: '2026-08-18T21:00:00.000Z' } }),
      'me',
      NOW
    )!;
    expect(view.ended).toBe(true);
    expect(view.canRecord).toBe(false);
    expect(view.deadlineLabel).toBe('끝났어요');
    // 결과는 그대로 보여준다. 78%로 끝났으면 78%다.
    expect(view.percentLabel).toBe('50%');
  });

  it('마지막 날 오후는 아직 끝난 것이 아니다', () => {
    const view = buildGoalView(
      group,
      snapshot({ goal: { ...snapshot().goal, ends_at: '2026-08-19T12:00:00.000Z' } }),
      'me',
      NOW
    )!;
    expect(view.ended).toBe(false);
    expect(view.canRecord).toBe(true);
  });

  it('목표가 없으면 null. 빈 상태는 실패가 아니다', () => {
    expect(buildGoalView(group, null, 'me', NOW)).toBeNull();
  });
});

describe('pickHeroGoal', () => {
  const soon = buildGoalView(group, snapshot(), 'me', NOW)!;
  const later = buildGoalView(
    { ...group, id: 'group-2' },
    snapshot({
      goal: { ...snapshot().goal, id: 'goal-2', group_id: 'group-2', ends_at: '2026-09-10T21:00:00.000Z' },
    }),
    'me',
    NOW
  )!;
  const scheduled = buildGoalView(
    { ...group, id: 'group-3' },
    snapshot({
      started: false,
      goal: { ...snapshot().goal, id: 'goal-3', group_id: 'group-3', ends_at: '2026-08-21T21:00:00.000Z' },
    }),
    'me',
    NOW
  )!;

  it('오늘 신경 써야 하는 것이 위로 — 남은 날이 적은 순', () => {
    expect(pickHeroGoal([later, soon])?.goalId).toBe('goal-1');
  });

  it('아직 시작하지 않은 목표는 더 급해 보여도 뒤로 간다', () => {
    expect(pickHeroGoal([scheduled, later])?.goalId).toBe('goal-2');
  });

  it('끝난 목표는 맨 뒤 — 오늘 적을 수 있는 것이 위다', () => {
    const done = buildGoalView(
      { ...group, id: 'group-4' },
      snapshot({
        goal: { ...snapshot().goal, id: 'goal-4', group_id: 'group-4', ends_at: '2026-08-18T21:00:00.000Z' },
      }),
      'me',
      NOW
    )!;
    // 남은 날로만 세우면 0일인 끝난 목표가 1등이 된다.
    expect(pickHeroGoal([done, later])?.goalId).toBe('goal-2');
    expect(pickHeroGoal([done, scheduled])?.goalId).toBe('goal-3');
  });

  it('사용자가 지목한 그룹이 항상 이긴다', () => {
    expect(pickHeroGoal([soon, later], 'group-2')?.goalId).toBe('goal-2');
  });

  it('없으면 null', () => {
    expect(pickHeroGoal([])).toBeNull();
  });
});

describe('formatAmount', () => {
  it('정수는 정수로 — 5번이지 5.00번이 아니다', () => {
    expect(formatAmount(5)).toBe('5');
    expect(formatAmount(2.5)).toBe('2.5');
    expect(formatAmount(2.5039)).toBe('2.5');
  });
});
