import { describe, expect, it } from 'vitest';

import { hasStaleSync, poolState, POOL_VISUALS, STALE_AFTER_MS } from './pool-state';

const ok = { permission: true };

describe('poolState', () => {
  it('권한이 없으면 다른 무엇보다 먼저다 — 우리 숫자가 아니기 때문', () => {
    expect(poolState(0.5, 0, { permission: false })).toBe('permissionOff');
    expect(poolState(2, 3600, { permission: false })).toBe('permissionOff');
  });

  it('경계값', () => {
    expect(poolState(0, 0, ok)).toBe('fresh');
    expect(poolState(0.049, 0, ok)).toBe('fresh');
    expect(poolState(0.05, 0, ok)).toBe('normal');
    expect(poolState(0.699, 0, ok)).toBe('normal');
    expect(poolState(0.7, 0, ok)).toBe('tightening');
    expect(poolState(0.879, 0, ok)).toBe('tightening');
    expect(poolState(0.88, 0, ok)).toBe('approaching');
    expect(poolState(0.999, 0, ok)).toBe('approaching');
    expect(poolState(1, 0, ok)).toBe('complete');
  });

  it('초과분이 있으면 한도 도달이 아니라 초과다', () => {
    expect(poolState(1.08, 2400, ok)).toBe('over');
  });

  it('모든 상태에 빛이 정의돼 있다', () => {
    for (const state of [
      'fresh',
      'normal',
      'tightening',
      'approaching',
      'complete',
      'over',
      'permissionOff',
    ] as const) {
      expect(POOL_VISUALS[state]).toBeDefined();
      expect(POOL_VISUALS[state].arc.length).toBeGreaterThan(1);
    }
  });
});

describe('hasStaleSync', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  const fresh = new Date(now.getTime() - 60_000).toISOString();
  const old = new Date(now.getTime() - STALE_AFTER_MS - 1000).toISOString();

  it('한 명이라도 늦으면 참', () => {
    expect(hasStaleSync([fresh, old], now)).toBe(true);
  });

  it('전원이 최신이면 거짓', () => {
    expect(hasStaleSync([fresh, fresh], now)).toBe(false);
  });

  it('아직 한 번도 안 올린 사람은 "늦음"이 아니다 — 0초 쓴 것과 구분해야 한다', () => {
    expect(hasStaleSync([null, fresh], now)).toBe(false);
  });

  it('데이터가 없는 상태 위에는 얹히지 않는다', () => {
    expect(hasStaleSync([old], now, 'fresh')).toBe(false);
    expect(hasStaleSync([old], now, 'permissionOff')).toBe(false);
    expect(hasStaleSync([old], now, 'normal')).toBe(true);
  });
});
