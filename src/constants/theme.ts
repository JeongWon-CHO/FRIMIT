/**
 * 앱 테마 — Design V1 토큰에서 파생한다.
 *
 * 값의 출처는 `design-tokens.ts` 하나뿐이다(승인된 핸드오프 사본). 이 파일은
 * 기존 화면들이 쓰던 이름(`theme.surface`, `Spacing.three`, `memberHue()` …)을
 * 그 토큰 위에 얹어 주는 얇은 층이다. 화면을 한 번에 다 옮길 수 없으므로
 * 이름을 유지한 채 값만 갈아 끼운다.
 *
 * **라이트 모드는 없다.** 디자인은 #050507 다크 전용이다. `Colors.light`는
 * 지워지지 않고 다크와 같은 객체를 가리킨다 — 아직 `useColorScheme()`으로
 * 갈라지는 호출부가 남아 있어도 밝은 화면이 나올 수 없게 하기 위해서다.
 */

import { colors, gradients, radius, spacing } from '@/constants/design-tokens';

const palette = {
  text: colors.text.primary,
  background: colors.background.base,
  /** 배경에서 한 겹 뜬 면 (행, 작은 카드) */
  backgroundElement: colors.surface.elevated,
  backgroundSelected: colors.surface.glass,
  textSecondary: colors.text.secondary,

  /** 카드 표면 */
  surface: colors.surface.card,
  border: colors.border.hairline,
  accent: colors.accent.violetSoft,
  /** 강조색 위에 얹는 글자색 */
  onAccent: colors.text.onLight,
  /** 강조색의 옅은 배경 버전 (칩, 선택 상태) */
  accentQuiet: colors.border.violet,
  /** 공동 풀 바에서 아직 쓰지 않은 구간 */
  poolTrack: 'rgba(255,255,255,0.055)',
  caution: colors.state.staleSync,
  /** 초과. 빨강이 아니라 절제된 분홍이다 — 넘겨도 비난하지 않는다. */
  over: colors.state.overLimit,
  positive: colors.state.healthy,
} as const;

export const Colors = {
  light: palette,
  dark: palette,
} as const;

export type ThemeColor = keyof typeof palette;

/**
 * 아바타·풀 바에서 사람에게 붙는 색.
 *
 * 순서에 의미를 주지 않는다 — 밝은 색이 더 많이 썼다는 뜻이 아니다. 디자인의
 * `gradients.avatarFills`는 인덱스 기반이지만, 목록 순서가 바뀌면 사람 색이
 * 바뀌므로 여기서는 팔레트만 가져오고 배정은 profile_id 해시로 유지한다.
 */
const memberPalette = gradients.avatarFills.map(([from]) => from);

export const MemberHues = {
  light: memberPalette,
  dark: memberPalette,
} as const;

/** 같은 사람이 어느 그룹에서나 같은 색을 갖도록 id에서 결정한다. */
export function memberHue(profileId: string, _scheme?: 'light' | 'dark'): string {
  let sum = 0;
  for (let index = 0; index < profileId.length; index += 1) {
    sum = (sum + profileId.charCodeAt(index)) % 4096;
  }
  return memberPalette[sum % memberPalette.length];
}

/** 같은 해시로 아바타 그라데이션 쌍을 고른다. */
export function memberFill(profileId: string): readonly [string, string] {
  let sum = 0;
  for (let index = 0; index < profileId.length; index += 1) {
    sum = (sum + profileId.charCodeAt(index)) % 4096;
  }
  return gradients.avatarFills[sum % gradients.avatarFills.length];
}

/**
 * 서체.
 *
 * Manrope에는 한글 글리프가 없다. 한글은 `fontFamily`를 비워 시스템 얼굴로
 * 떨어뜨리고(iOS Apple SD Gothic Neo, Android Noto Sans KR), 숫자·영문 라벨에만
 * Manrope를 건다. 그래서 여기 있는 이름은 "이 글자에 이걸 쓰라"가 아니라
 * "쓸 수 있으면 이걸 쓰라"에 가깝다.
 */
export const Fonts = {
  sans: 'Manrope_800ExtraBold',
  sansBold: 'Manrope_800ExtraBold',
  sansMedium: 'Manrope_500Medium',
  sansSemi: 'Manrope_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoRegular: 'JetBrainsMono_400Regular',
  /** 한글이 섞이는 자리. 시스템 얼굴에 맡긴다. */
  system: undefined,
} as const;

export const Spacing = {
  half: 2,
  one: spacing.xxs,
  two: spacing.xs,
  three: spacing.md,
  four: spacing.lg,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  bar: radius.pill,
  control: radius.button,
  card: radius.groupCard,
  pill: radius.pill,
} as const;

/** 하단 네비게이션이 가리는 높이. 안전영역은 별도로 더한다. */
export const BottomTabInset = spacing.contentBottom;
export const MaxContentWidth = 800;
