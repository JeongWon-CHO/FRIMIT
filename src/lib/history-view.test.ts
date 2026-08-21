import { describe, expect, it } from 'vitest';

import { toBars, underLimitStreak, weeklyAverage } from './history-view';
import type { RecentDay } from './history';

/** 8월 14일(금)부터 20일(목)까지. 마지막이 오늘이다. */
function week(
  values: { total: number; mine: number; limit?: number }[]
): RecentDay[] {
  return values.map((value, index) => {
    const day = 14 + index;
    return {
      date_key: `2026-08-${day}`,
      // 서울 오전 6시 = 전날 21시 UTC
      period_start: `2026-08-${day - 1}T21:00:00.000Z`,
      total_seconds: value.total,
      limit_seconds: value.limit ?? 7200,
      my_seconds: value.mine,
    };
  });
}

const STARTED = '2026-08-01T21:00:00.000Z';

describe('weeklyAverage', () => {
  it('오늘은 빼고 센다 — 끝나지 않은 하루를 넣으면 저녁마다 평균이 올라간다', () => {
    const days = week([
      { total: 3600, mine: 1800 },
      { total: 3600, mine: 1800 },
      { total: 3600, mine: 1800 },
      { total: 3600, mine: 1800 },
      { total: 3600, mine: 1800 },
      { total: 3600, mine: 1800 },
      // 오늘. 아직 30분뿐이지만 평균을 끌어내리면 안 된다.
      { total: 600, mine: 300 },
    ]);

    expect(weeklyAverage(days, STARTED)).toBe(1800);
  });

  it('그룹이 시작하기 전날은 세지 않는다 — 0인 건 적게 쓴 게 아니라 집계가 없던 것', () => {
    const days = week([
      { total: 0, mine: 0 },
      { total: 0, mine: 0 },
      { total: 0, mine: 0 },
      { total: 0, mine: 0 },
      { total: 0, mine: 0 },
      { total: 7200, mine: 3600 },
      { total: 600, mine: 300 },
    ]);

    // 8월 19일 06시(= 18일 21시 UTC)에 시작했으면 셀 수 있는 날은 19일 하루뿐이다.
    expect(weeklyAverage(days, '2026-08-18T21:00:00.000Z')).toBe(3600);
  });

  it('시작하지 않은 그룹은 평균이 없다', () => {
    expect(weeklyAverage(week([{ total: 0, mine: 0 }]), null)).toBe(0);
  });
});

describe('underLimitStreak', () => {
  it('어제부터 거슬러 센다 — 오늘은 아직 넘길 수 있는 하루다', () => {
    const days = week([
      { total: 7200, mine: 0 },
      { total: 7200, mine: 0 },
      { total: 7200, mine: 0 },
      { total: 7200, mine: 0 },
      { total: 7200, mine: 0 },
      { total: 7200, mine: 0 },
      // 오늘 이미 넘겼지만 기록은 유지된다.
      { total: 99999, mine: 0 },
    ]);

    expect(underLimitStreak(days, STARTED)).toBe(6);
  });

  it('한 번 넘긴 날에서 끊긴다', () => {
    const days = week([
      { total: 100, mine: 0 },
      { total: 100, mine: 0 },
      { total: 100, mine: 0 },
      { total: 9999, mine: 0 },
      { total: 100, mine: 0 },
      { total: 100, mine: 0 },
      { total: 100, mine: 0 },
    ]);

    expect(underLimitStreak(days, STARTED)).toBe(2);
  });

  it('한도에 정확히 닿은 날은 넘긴 것이 아니다', () => {
    const days = week([{ total: 7200, mine: 0 }, { total: 0, mine: 0 }]);
    expect(underLimitStreak(days, STARTED)).toBe(1);
  });
});

describe('toBars', () => {
  const bars = toBars(
    week([
      { total: 3600, mine: 0 },
      { total: 14400, mine: 0 },
      { total: 0, mine: 0, limit: 0 },
    ])
  );

  it('요일을 붙인다', () => {
    // 2026-08-14는 금요일이다.
    expect(bars.map((bar) => bar.label)).toEqual(['금', '토', '일']);
  });

  it('넘긴 날도 막대는 1에서 멈춘다 — 넘긴 정도는 색이 말한다', () => {
    expect(bars[1].ratio).toBe(1);
    expect(bars[1].over).toBe(true);
  });

  it('한도가 없던 날은 넘긴 것이 아니다', () => {
    expect(bars[2].ratio).toBe(0);
    expect(bars[2].over).toBe(false);
  });

  it('마지막 칸이 오늘', () => {
    expect(bars.map((bar) => bar.today)).toEqual([false, false, true]);
  });
});
