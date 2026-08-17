import { describe, expect, it } from 'vitest';

import {
  frimitDateKey,
  isStalePeriod,
  nextPeriodStartFor,
  periodStartFor,
  zonedParts,
} from './frimit-day';

const SEOUL = 'Asia/Seoul';

/** 서울 벽시계 시각을 UTC 순간으로 (서울은 항상 UTC+9, 서머타임 없음). */
function seoul(iso: string): Date {
  return new Date(`${iso}+09:00`);
}

describe('periodStartFor', () => {
  it('오전 6시 이후는 같은 날 오전 6시가 시작점이다', () => {
    const start = periodStartFor(seoul('2026-08-13T09:30:00'), SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-08-13T06:00:00').toISOString());
  });

  it('오전 6시 정각은 새 일자에 속한다', () => {
    const start = periodStartFor(seoul('2026-08-13T06:00:00'), SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-08-13T06:00:00').toISOString());
  });

  it('오전 5시 59분은 아직 전날이다', () => {
    const start = periodStartFor(seoul('2026-08-13T05:59:00'), SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-08-12T06:00:00').toISOString());
  });

  it('자정 직후도 전날에 속한다', () => {
    const start = periodStartFor(seoul('2026-08-13T00:05:00'), SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-08-12T06:00:00').toISOString());
  });

  it('월 경계를 넘어가도 전날로 돌아간다', () => {
    const start = periodStartFor(seoul('2026-09-01T02:00:00'), SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-08-31T06:00:00').toISOString());
  });

  it('연 경계를 넘어가도 전날로 돌아간다', () => {
    const start = periodStartFor(seoul('2027-01-01T03:00:00'), SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-12-31T06:00:00').toISOString());
  });
});

describe('여행 중 — 기기 위치가 바뀌어도 그룹 시간대가 기준이다', () => {
  it('뉴욕에서 현지 오후 5시일 때도 서울 기준 일자로 계산한다', () => {
    // 2026-08-13 17:00 뉴욕(EDT, UTC-4) = 2026-08-14 06:00 서울.
    // 서울에서는 막 새 일자가 시작된 순간이다.
    const instant = new Date('2026-08-13T17:00:00-04:00');
    const start = periodStartFor(instant, SEOUL);
    expect(start.toISOString()).toBe(seoul('2026-08-14T06:00:00').toISOString());
  });

  it('같은 순간이라도 그룹 시간대가 다르면 다른 일자에 속한다', () => {
    const instant = new Date('2026-08-13T20:00:00Z'); // 서울 8/14 05:00, 뉴욕 8/13 16:00
    expect(frimitDateKey(instant, SEOUL)).toBe('2026-08-13');
    expect(frimitDateKey(instant, 'America/New_York')).toBe('2026-08-13');

    // 한 시간 뒤면 서울은 경계를 넘지만 뉴욕은 아직이다.
    const later = new Date('2026-08-13T21:00:00Z'); // 서울 8/14 06:00, 뉴욕 8/13 17:00
    expect(frimitDateKey(later, SEOUL)).toBe('2026-08-14');
    expect(frimitDateKey(later, 'America/New_York')).toBe('2026-08-13');
  });
});

describe('서머타임이 있는 시간대', () => {
  it('DST 시작일에도 오전 6시 경계를 정확히 잡는다', () => {
    // 미국 동부 2026-03-08 02:00에 시계가 03:00으로 건너뛴다.
    // 그날의 오전 6시는 정상적으로 존재한다 (EDT, UTC-4).
    const instant = new Date('2026-03-08T12:00:00-04:00');
    const start = periodStartFor(instant, 'America/New_York');
    expect(start.toISOString()).toBe(new Date('2026-03-08T06:00:00-04:00').toISOString());
  });

  it('DST 종료일에도 하루가 정확히 24시간보다 길어진다', () => {
    // 2026-11-01에 시계가 한 시간 뒤로 간다. 그날 하루는 25시간이다.
    const start = periodStartFor(new Date('2026-11-01T12:00:00-05:00'), 'America/New_York');
    const next = nextPeriodStartFor(new Date('2026-11-01T12:00:00-05:00'), 'America/New_York');
    const hours = (next.getTime() - start.getTime()) / (60 * 60 * 1000);
    expect(hours).toBe(24);
  });
});

describe('nextPeriodStartFor', () => {
  it('다음 경계는 정확히 다음 오전 6시다', () => {
    const now = seoul('2026-08-13T09:30:00');
    expect(nextPeriodStartFor(now, SEOUL).toISOString()).toBe(
      seoul('2026-08-14T06:00:00').toISOString()
    );
  });

  it('오전 6시 이전이면 오늘 오전 6시가 다음 경계다', () => {
    const now = seoul('2026-08-13T03:00:00');
    expect(nextPeriodStartFor(now, SEOUL).toISOString()).toBe(
      seoul('2026-08-13T06:00:00').toISOString()
    );
  });

  it('서울 기준 하루는 정확히 24시간이다', () => {
    const now = seoul('2026-08-13T09:30:00');
    const start = periodStartFor(now, SEOUL);
    const next = nextPeriodStartFor(now, SEOUL);
    expect(next.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('frimitDateKey', () => {
  it('새벽 시간대는 전날 날짜로 표시된다', () => {
    expect(frimitDateKey(seoul('2026-08-13T02:00:00'), SEOUL)).toBe('2026-08-12');
    expect(frimitDateKey(seoul('2026-08-13T06:00:00'), SEOUL)).toBe('2026-08-13');
  });
});

describe('isStalePeriod', () => {
  it('같은 Frimit 일자 안이면 낡지 않았다', () => {
    const start = seoul('2026-08-13T06:00:00');
    expect(isStalePeriod(start, seoul('2026-08-13T23:59:00'), SEOUL)).toBe(false);
    // 다음 날 새벽 3시는 아직 경계를 넘지 않았다.
    expect(isStalePeriod(start, seoul('2026-08-14T03:00:00'), SEOUL)).toBe(false);
  });

  it('오전 6시를 넘기면 낡았다', () => {
    const start = seoul('2026-08-13T06:00:00');
    expect(isStalePeriod(start, seoul('2026-08-14T06:00:00'), SEOUL)).toBe(true);
    expect(isStalePeriod(start, seoul('2026-08-16T14:00:00'), SEOUL)).toBe(true);
  });

  /**
   * iOS의 intervalDidStart는 콜백이 실제로 불린 시각을 적으므로 정확히 06:00:00이
   * 아니다. 여기서 낡았다고 판단하면 다시 무장하게 되고, 네이티브가 구간이 바뀐 줄
   * 알고 그날 누적을 0으로 되돌린다. 조용히 하루치가 사라지는 종류의 실수다.
   */
  it('경계보다 살짝 늦게 기록된 구간 시작을 낡았다고 보지 않는다', () => {
    const late = new Date(seoul('2026-08-13T06:00:00').getTime() + 340);
    expect(isStalePeriod(late, seoul('2026-08-13T20:00:00'), SEOUL)).toBe(false);
  });
});

/**
 * 기기가 들고 있는 구간에는 시작뿐 아니라 **끝**도 필요하다. Android에는 경계에서
 * 구간을 넘겨 줄 콜백이 없어 읽을 때마다 `[시작, 지금]`을 다시 계산하는데, 앱이
 * 닫힌 채 오전 6시를 넘기면 그 창이 경계 너머까지 뻗는다. 실기기 2차 측정
 * (2026-08-17)에서 08-16 칸에 08-17 오전 4시간이 들어간 경로가 이것이다.
 */
describe('낡은 구간의 끝', () => {
  it('경계를 넘긴 뒤에도 어제 구간의 끝은 어제의 다음 오전 6시다', () => {
    const stored = seoul('2026-08-16T06:00:00');
    const now = seoul('2026-08-17T10:05:00');

    expect(isStalePeriod(stored, now, SEOUL)).toBe(true);
    // 네이티브는 "지금"이 아니라 이 시각까지만 세야 한다.
    expect(nextPeriodStartFor(stored, SEOUL).toISOString()).toBe(
      seoul('2026-08-17T06:00:00').toISOString()
    );
  });

  it('새로 무장하는 구간의 시작과 끝은 서로 이어진다', () => {
    const now = seoul('2026-08-17T10:05:00');
    expect(nextPeriodStartFor(now, SEOUL).toISOString()).toBe(
      // 08-17 구간의 끝 = 08-18 06:00. 다음 무장의 시작과 같은 값이다.
      seoul('2026-08-18T06:00:00').toISOString()
    );
    expect(periodStartFor(now, SEOUL).toISOString()).toBe(
      seoul('2026-08-17T06:00:00').toISOString()
    );
  });
});

describe('zonedParts', () => {
  it('자정을 0시로 정규화한다', () => {
    const parts = zonedParts(seoul('2026-08-13T00:00:00'), SEOUL);
    expect(parts.hour).toBe(0);
    expect(parts.day).toBe(13);
  });
});
