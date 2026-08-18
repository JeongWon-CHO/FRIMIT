/**
 * 디자인 토큰.
 *
 * 색은 이 제품의 유일한 상수인 **오전 6시**에서 가져왔다. 하루가 자정이 아니라
 * 동트기 전에 바뀌는 앱이므로, 팔레트도 새벽에서 아침으로 넘어가는 구간을 쓴다 —
 * 짙은 인디고 잉크, 페리윙클 강조색, 살구색 주의, 장미색 초과.
 *
 * 초과를 빨강으로 칠하지 않는 것은 미감이 아니라 제품 규칙이다. 한도를 넘겨도
 * 차단하지 않고 비난하지도 않는다(plan.md 10행). 경고음이 아니라 사실 통보다.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1630',
    background: '#FAF8FF',
    backgroundElement: '#F1EEFB',
    backgroundSelected: '#E4DEF7',
    textSecondary: '#635C7E',

    /** 카드처럼 배경에서 한 겹 떠 있는 면 */
    surface: '#FFFFFF',
    border: '#E7E2F5',
    accent: '#5B4BE8',
    /** 강조색 위에 얹는 글자색 */
    onAccent: '#FFFFFF',
    /** 강조색의 옅은 배경 버전 (칩, 선택 상태) */
    accentQuiet: '#ECE8FF',
    /** 공동 풀 바에서 아직 쓰지 않은 구간 */
    poolTrack: '#E9E4F7',
    caution: '#B5720F',
    over: '#D0426A',
    positive: '#12855F',
  },
  dark: {
    text: '#F5F3FC',
    background: '#131120',
    backgroundElement: '#1E1B2D',
    backgroundSelected: '#2C2740',
    textSecondary: '#A49CC2',

    surface: '#1C1930',
    border: '#2E2945',
    accent: '#9184FF',
    onAccent: '#15122A',
    accentQuiet: '#282243',
    poolTrack: '#272238',
    caution: '#E9B25C',
    over: '#F0708F',
    positive: '#43CBA1',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * 공동 풀 바에서 멤버 구간에 쓰는 색.
 *
 * 순서에 의미를 주지 않는다 — 밝은 색이 더 많이 썼다는 뜻이 아니다. 같은 사람이
 * 매번 같은 색으로 보이게 profile_id에서 뽑아 쓰기만 한다(`memberHue`).
 * 등수 표시가 없는 제품이라(plan.md 10행) 색에도 서열을 넣지 않는다.
 */
export const MemberHues = {
  light: ['#6C5CE7', '#2AA9A0', '#E08A2E', '#D4568C', '#4A8FE0', '#7FA82C', '#B4632E', '#8B5FBF'],
  dark: ['#9184FF', '#45C9BF', '#F0AC55', '#F080AC', '#6FB0F5', '#A5CE4E', '#D98A52', '#B189E8'],
} as const;

/** 같은 사람이 어느 그룹에서나 같은 색을 갖도록 id에서 결정한다. */
export function memberHue(profileId: string, scheme: 'light' | 'dark'): string {
  const hues = MemberHues[scheme];
  let sum = 0;
  for (let index = 0; index < profileId.length; index += 1) {
    sum = (sum + profileId.charCodeAt(index)) % 4096;
  }
  return hues[sum % hues.length];
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * 모서리 반경.
 *
 * 카드는 크게(20), 칩·버튼은 알약(999), 풀 바는 캡슐(8)로 둔다. 표시용 서체가
 * iOS에서 `ui-rounded`라 각진 모서리와 부딪히므로 전체적으로 둥근 쪽에 맞췄다.
 */
export const Radius = {
  bar: 8,
  control: 14,
  card: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
