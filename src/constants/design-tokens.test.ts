import { describe, expect, it } from 'vitest';

import {
  colors as handoffColors,
  gradients as handoffGradients,
  opacity as handoffOpacity,
} from '../../docs/design/design_handoff_frimit_core/DESIGN_TOKENS';
import { colors, gradients, opacity } from './design-tokens';
import { splitColor } from '@/lib/color';

/**
 * 대비 회귀 테스트.
 *
 * 이 앱은 `#050507` 위에서만 산다. 그런 배경에서 WCAG 2의 휘도비는 관대해서,
 * 눈으로 안 읽히는 색이 수치로는 통과하곤 한다. 그래서 여기서는 두 가지를 함께
 * 잰다 — 법적 기준인 WCAG AA(4.5:1)와, 지각에 더 가까운 APCA Lc다.
 *
 * 재는 대상은 "선언된 색"이 아니라 **실제로 합성된 색**이다. 텍스트 램프가 전부
 * 알파를 쓰기 때문에, 같은 토큰이라도 어느 표면 위냐에 따라 결과가 달라진다.
 * 그래서 텍스트가 실제로 올라가는 배경을 전부 나열해 두고 그 최악값을 본다.
 *
 * 값을 낮추고 싶어지면 먼저 이 테스트를 보라. 여기가 빨개진다는 건 어두운 방에서
 * 그 글자가 사라진다는 뜻이다.
 */

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** 알파가 붙은 색을 배경 위에 얹는다. RN은 감마 공간에서 섞는다. */
function composite(color: string, background: RGB): RGB {
  const { rgb, alpha } = splitColor(color);
  const parsed = rgb.startsWith('#')
    ? toRgb(rgb)
    : (rgb.match(/\d+/g)!.map(Number) as RGB);
  return parsed.map((c, i) => c * alpha + background[i] * (1 - alpha)) as RGB;
}

function relativeLuminance([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG 2.1 휘도 대비비. */
function ratio(foreground: RGB, background: RGB): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** APCA 0.1.9 — 어두운 배경에서 WCAG가 놓치는 것을 잡는다. */
function screenLuminance([r, g, b]: RGB): number {
  const y =
    0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.072175 * (b / 255) ** 2.4;
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
}

function lc(text: RGB, background: RGB): number {
  const yText = screenLuminance(text);
  const yBg = screenLuminance(background);
  if (Math.abs(yBg - yText) < 0.0005) return 0;

  // 밝은 글자/어두운 배경과 그 반대는 대칭이 아니다. 부호가 그 방향을 담는다.
  const sapc =
    yBg > yText
      ? (yBg ** 0.56 - yText ** 0.57) * 1.14
      : (yBg ** 0.65 - yText ** 0.62) * 1.14;
  if (Math.abs(sapc) < 0.1) return 0;
  return Math.abs(yBg > yText ? sapc - 0.027 : sapc + 0.027) * 100;
}

/** 그라데이션 한 지점의 색. RN은 채널별로 선형 보간한다. */
function stopAt(from: string, to: string, t: number): RGB {
  const a = toRgb(from);
  const b = toRgb(to);
  return a.map((c, i) => c + (b[i] - c) * t) as RGB;
}

/**
 * 텍스트가 실제로 올라가는 불투명 배경 전부.
 *
 * 마지막 항목이 중요하다 — 블룸은 카드 배경을 들어 올린다. 밝은 글자에게 그건
 * 대비 손실이고, 히어로 카드가 가장 자주 실패하던 자리다.
 */
const SURFACES: Record<string, RGB> = {
  base: toRgb(colors.background.base),
  deep: toRgb(colors.background.deep),
  cardNeutral: toRgb(colors.surface.cardNeutral),
  cardViolet: toRgb(colors.surface.cardViolet),
  cardCyan: toRgb(colors.surface.cardCyan),
  cardPink: toRgb(colors.surface.cardPink),
  elevated: toRgb(colors.surface.elevated),
  card: toRgb(colors.surface.card),
  row: composite(colors.surface.row, toRgb(colors.background.base)),
  glass: composite(colors.surface.glass, toRgb(colors.background.base)),
  heroSurface: toRgb(gradients.heroSurface.colors[0]),
  heroSurfaceToday: toRgb(gradients.heroSurfaceToday.colors[0]),
  bloomLiftedCard: composite(
    `rgba(124,77,255,${opacity.bloomCard * 0.55})`,
    toRgb(colors.surface.cardViolet),
  ),
};

/** 본문·라벨로 쓰이는 톤. `disabled`는 텍스트가 아니라 따로 잰다. */
const TEXT_TONES = [
  'primary',
  'body',
  'secondary',
  'muted',
  'metadata',
  'faint',
  'placeholder',
  'link',
] as const;

const AA_NORMAL = 4.5;
const UI_ELEMENT = 3;

describe('텍스트 램프', () => {
  for (const tone of TEXT_TONES) {
    for (const [name, background] of Object.entries(SURFACES)) {
      it(`${tone} / ${name} — AA 4.5:1`, () => {
        const measured = ratio(composite(colors.text[tone], background), background);
        expect(measured).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }

  // 가장 흐린 텍스트 단계도 지각상 "겨우 보이는" 수준(Lc 15)을 한참 넘어야 한다.
  it('가장 흐린 단계도 APCA 하한을 넘는다', () => {
    for (const [name, background] of Object.entries(SURFACES)) {
      const measured = lc(composite(colors.text.faint, background), background);
      expect(measured, `faint / ${name}`).toBeGreaterThanOrEqual(35);
    }
  });

  it('램프가 단조롭게 어두워진다 — 위계가 유지된다', () => {
    const base = SURFACES.base;
    const steps = (['primary', 'body', 'muted', 'metadata', 'faint', 'disabled'] as const).map(
      (tone) => relativeLuminance(composite(colors.text[tone], base)),
    );
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index], `step ${index}`).toBeLessThan(steps[index - 1]);
    }
  });

  it('disabled는 텍스트 기준이 아니라 UI 요소 기준을 받는다', () => {
    for (const [name, background] of Object.entries(SURFACES)) {
      const measured = ratio(composite(colors.text.disabled, background), background);
      expect(measured, `disabled / ${name}`).toBeGreaterThanOrEqual(UI_ELEMENT);
    }
  });
});

describe('강조색 위 텍스트', () => {
  // 라벨이 올라가는 그라데이션은 양 끝이 아니라 라벨이 덮는 구간 전체를 재야 한다.
  it('기본 CTA 그라데이션 전 구간에서 라벨이 AA를 넘는다', () => {
    const [from, to] = gradients.primaryAction.colors;
    const label = toRgb(colors.text.primary);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(ratio(label, stopAt(from, to, t)), `t=${t}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('상태색은 기본 배경에서 AA를 넘는다', () => {
    const base = SURFACES.base;
    for (const [name, value] of Object.entries(colors.state)) {
      expect(ratio(toRgb(value), base), name).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe('하단 네비게이션', () => {
  // 선택되지 않은 탭은 View 하나에 opacity가 걸린다. 라벨과 아이콘이 함께 흐려지므로
  // 장식이 아니라 텍스트 기준을 받는다.
  it('비선택 탭 라벨이 AA를 넘는다', () => {
    const base = SURFACES.base;
    const { rgb } = splitColor(colors.text.primary);
    const faded = composite(`rgba(${toRgb(rgb).join(',')},${opacity.navInactive})`, base);
    expect(ratio(faded, base)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('핸드오프 동기화', () => {
  // 색은 디자인 핸드오프가 원본이다. 앱 쪽만 고치면 다음 핸드오프 갱신이 저대비
  // 값을 조용히 되돌려 놓는다. 여기서 두 사본이 갈라지는 순간 실패시킨다.
  // (spacing·layout은 구현에서 의도적으로 갈라져 있으므로 비교하지 않는다.)
  it('색·그라데이션·불투명도가 앱 토큰과 같다', () => {
    expect(handoffColors).toEqual(colors);
    expect(handoffGradients).toEqual(gradients);
    expect(handoffOpacity).toEqual(opacity);
  });
});
