import { describe, expect, it } from 'vitest';

import {
  avatarAngles,
  avatarPosition,
  overshootDegrees,
  ringRadius,
  ringStroke,
  segmentsFor,
  visibleSeats,
} from './orbit';

describe('avatarAngles', () => {
  it('12시에서 시작한다', () => {
    expect(avatarAngles(4)[0]).toBe(-90);
  });

  it('균등하게 나눈다', () => {
    expect(avatarAngles(4)).toEqual([-90, 0, 90, 180]);
    expect(avatarAngles(2)).toEqual([-90, 90]);
    expect(avatarAngles(3)).toEqual([-90, 30, 150]);
  });
});

describe('avatarPosition', () => {
  it('모든 아바타가 같은 반지름 위에 앉는다 — 2~9명 전부', () => {
    const radius = 73.7;

    for (let count = 2; count <= 9; count += 1) {
      for (const angle of avatarAngles(count)) {
        const { x, y } = avatarPosition(angle, radius);
        expect(Math.hypot(x, y)).toBeCloseTo(radius, 6);
      }
    }
  });

  it('12시는 중심 바로 위다', () => {
    const { x, y } = avatarPosition(-90, 100);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(-100, 6);
  });
});

describe('ringStroke · ringRadius', () => {
  it('비율은 지름이 아니라 바깥 반지름 기준이다 — 162px 링의 스트로크는 14.6', () => {
    expect(ringStroke(162, 0.18)).toBeCloseTo(14.58, 2);
  });

  it('그래서 Today 히어로의 아바타 반지름이 73.7이 된다', () => {
    expect(ringRadius(162, ringStroke(162, 0.18))).toBeCloseTo(73.71, 2);
  });

  it('그룹 상세는 122px에 0.26 — 스트로크 16, 아바타 반지름 53', () => {
    expect(ringStroke(122, 0.26)).toBeCloseTo(15.86, 2);
  });
});

describe('segmentsFor', () => {
  const C = 2 * Math.PI * 66;

  it('구간 길이의 합이 사용량 비율과 같다 (틈 제외)', () => {
    const segments = segmentsFor([60, 30, 10], 200, C, 0);
    const total = segments.reduce((sum, s) => sum + s.length, 0);
    expect(total / C).toBeCloseTo(0.5, 6);
  });

  it('구간이 앞선 구간 끝에서 이어진다', () => {
    const segments = segmentsFor([50, 50], 200, C, 0);
    expect(segments[0].offset).toBe(0);
    expect(segments[1].offset).toBeCloseTo(C * 0.25, 6);
  });

  it('틈만큼 각 구간이 짧아진다', () => {
    const withGap = segmentsFor([100], 200, C, 2);
    const withoutGap = segmentsFor([100], 200, C, 0);
    expect(withoutGap[0].length - withGap[0].length).toBeCloseTo((2 / 360) * C, 6);
  });

  it('한 바퀴를 넘기지 않는다 — 넘긴 구간이 앞 구간 위에 겹쳐 그려지면 안 된다', () => {
    const segments = segmentsFor([150, 150], 200, C, 0);
    const last = segments[segments.length - 1];
    expect(last.offset + last.length).toBeLessThanOrEqual(C + 1e-9);
  });

  it('한도가 0이면 그릴 것이 없다', () => {
    expect(segmentsFor([10], 0, C)).toEqual([]);
  });
});

describe('overshootDegrees', () => {
  it('초과가 없으면 0이다', () => {
    expect(overshootDegrees(0, 28800)).toBe(0);
  });

  it('비율만큼 벌어진다', () => {
    expect(overshootDegrees(2880, 28800)).toBeCloseTo(36, 6);
  });

  it('60도에서 멈춘다 — 두 바퀴 도는 링은 고장으로 읽힌다', () => {
    expect(overshootDegrees(28800 * 3, 28800)).toBe(60);
  });
});

describe('visibleSeats', () => {
  it('8명까지는 그대로 보여준다', () => {
    expect(visibleSeats([1, 2, 3, 4, 5, 6, 7, 8]).overflow).toBe(0);
  });

  it('9명부터는 7명 + 나머지', () => {
    const { shown, overflow } = visibleSeats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(shown).toHaveLength(7);
    expect(overflow).toBe(3);
  });
});
