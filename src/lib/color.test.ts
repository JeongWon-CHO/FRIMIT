import { describe, expect, it } from 'vitest';

import { hexToRgba, splitColor } from './color';

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

describe('splitColor', () => {
  it('rgba에서 알파를 떼어낸다 — stopColor는 알파를 이해하지 못한다', () => {
    expect(splitColor('rgba(124,77,255,0.55)')).toEqual({ rgb: 'rgb(124, 77, 255)', alpha: 0.55 });
  });

  it('hex는 알파 1이다', () => {
    expect(splitColor('#7C4DFF')).toEqual({ rgb: '#7C4DFF', alpha: 1 });
  });

  it('8자리 hex의 뒤 두 자리는 알파다', () => {
    const { rgb, alpha } = splitColor('#000000FF');
    expect(rgb).toBe('rgb(0, 0, 0)');
    expect(alpha).toBe(1);
  });

  it('알파 없는 rgb도 받는다', () => {
    expect(splitColor('rgb(1, 2, 3)')).toEqual({ rgb: 'rgb(1, 2, 3)', alpha: 1 });
  });
});
