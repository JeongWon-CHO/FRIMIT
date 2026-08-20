import { describe, expect, it } from 'vitest';

import {
  formatDateKey,
  formatDuration,
  formatPoolHeadline,
  formatShort,
  formatUsedPercent,
  formatSyncAge,
  formatUntilReset,
  splitDuration,
} from './format';

describe('formatDuration', () => {
  it('초 단위를 버린다', () => {
    // 초를 적으면 없는 정밀도를 주장하게 된다 — iOS의 누적값은 분 단위 계단이다.
    expect(formatDuration(59)).toBe('0분');
    expect(formatDuration(61)).toBe('1분');
    expect(formatDuration(3599)).toBe('59분');
  });

  it('시간과 분을 함께 적되 0분은 생략한다', () => {
    expect(formatDuration(3600)).toBe('1시간');
    expect(formatDuration(4320)).toBe('1시간 12분');
    expect(formatDuration(7200)).toBe('2시간');
  });

  it('음수는 0으로 본다', () => {
    // 잔여시간은 0에서 멈추지만(서버가 greatest로 자른다) 화면 계산에서 음수가
    // 흘러들어도 "-1분 남음"이 보이지 않아야 한다.
    expect(formatDuration(-100)).toBe('0분');
  });
});

describe('splitDuration', () => {
  it('큰 숫자와 단위를 따로 준다', () => {
    expect(splitDuration(4320)).toEqual([
      { value: '1', unit: '시간' },
      { value: '12', unit: '분' },
    ]);
  });

  it('0초도 한 덩어리를 준다', () => {
    // 빈 배열을 주면 큰 숫자 자리가 아무것도 없는 카드가 된다.
    expect(splitDuration(0)).toEqual([{ value: '0', unit: '분' }]);
  });
});

describe('formatSyncAge', () => {
  const now = new Date('2026-08-17T12:00:00Z');

  it('한 번도 올리지 않은 것과 방금 올린 것을 구분한다', () => {
    // 이 구분이 무너지면 "0초 썼다"와 "동기화가 안 됐다"가 같은 문장이 된다.
    expect(formatSyncAge(null, now)).toBe('아직 동기화 안 됨');
    expect(formatSyncAge('2026-08-17T11:59:30Z', now)).toBe('방금 동기화');
  });

  it('경과 시간을 가장 큰 단위로 적는다', () => {
    expect(formatSyncAge('2026-08-17T11:48:00Z', now)).toBe('12분 전 동기화');
    expect(formatSyncAge('2026-08-17T09:00:00Z', now)).toBe('3시간 전 동기화');
    expect(formatSyncAge('2026-08-15T12:00:00Z', now)).toBe('2일 전 동기화');
  });
});

describe('formatUntilReset', () => {
  it('다음 경계까지 남은 시간을 센다', () => {
    const now = new Date('2026-08-17T12:00:00Z');
    // 08-18 06:00 KST = 08-17 21:00 UTC
    expect(formatUntilReset('2026-08-17T21:00:00Z', now)).toBe('9시간 후 초기화');
  });

  it('경계를 이미 지났으면 0으로 멈춘다', () => {
    const now = new Date('2026-08-17T22:00:00Z');
    expect(formatUntilReset('2026-08-17T21:00:00Z', now)).toBe('0분 후 초기화');
  });
});

describe('formatDateKey', () => {
  it('0을 떼고 사람 문장으로 옮긴다', () => {
    expect(formatDateKey('2026-08-17')).toBe('8월 17일');
    expect(formatDateKey('2026-01-01')).toBe('1월 1일');
  });
});

describe('formatShort · 디자인 표기', () => {
  it('시와 분을 함께 쓸 때 분을 두 자리로 맞춘다 — 숫자 폭이 흔들리지 않게', () => {
    expect(formatShort(3 * 3600 + 42 * 60)).toBe('3h 42m');
    expect(formatShort(3 * 3600 + 4 * 60)).toBe('3h 04m');
  });

  it('한 시간 미만이면 시를 떨어뜨린다', () => {
    expect(formatShort(48 * 60)).toBe('48m');
    expect(formatShort(0)).toBe('0m');
  });

  it('분이 0이면 시만 남긴다', () => {
    expect(formatShort(8 * 3600)).toBe('8h');
  });

  it('음수는 0으로 본다', () => {
    expect(formatShort(-100)).toBe('0m');
  });
});

describe('formatPoolHeadline', () => {
  it('평소에는 잔여를 보여준다', () => {
    expect(formatPoolHeadline(3 * 3600 + 42 * 60, 0)).toBe('3h 42m');
  });

  it('초과하면 초과분을 보여준다 — 잔여는 0에서 멈춰 있다', () => {
    expect(formatPoolHeadline(0, 42 * 60)).toBe('42m over');
  });
});

describe('formatUsedPercent', () => {
  it('반올림한다', () => {
    expect(formatUsedPercent(15552, 28800)).toBe('54% 사용');
  });

  it('늦은 멤버가 있으면 ~를 붙인다', () => {
    expect(formatUsedPercent(15552, 28800, true)).toBe('~54% 사용');
  });

  it('한도가 없으면 퍼센트가 성립하지 않는다', () => {
    expect(formatUsedPercent(100, 0)).toBe('기록 없음');
  });
});
