import { describe, expect, it } from 'vitest';

import { hexToRgba } from './color';

describe('hexToRgba', () => {
  it('hex를 rgba로 옮긴다', () => {
    expect(hexToRgba('#7C4DFF', 0.5)).toBe('rgba(124, 77, 255, 0.5)');
  });

  it('3자리 hex도 받는다', () => {
    expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('이미 알파가 붙은 rgba는 곱한다 — 토큰의 rgba는 "이만큼 흐린 빛"이다', () => {
    expect(hexToRgba('rgba(124,77,255,0.5)', 0.5)).toBe('rgba(124, 77, 255, 0.25)');
  });

  it('알파 없는 rgb도 받는다', () => {
    expect(hexToRgba('rgb(0, 0, 0)', 0.3)).toBe('rgba(0, 0, 0, 0.3)');
  });

  it('알파를 0~1로 자른다', () => {
    expect(hexToRgba('#000000', 2)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
  });
});
