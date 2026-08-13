import { describe, expect, it } from 'vitest';

import {
  frimitDateKey,
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

describe('zonedParts', () => {
  it('자정을 0시로 정규화한다', () => {
    const parts = zonedParts(seoul('2026-08-13T00:00:00'), SEOUL);
    expect(parts.hour).toBe(0);
    expect(parts.day).toBe(13);
  });
});
