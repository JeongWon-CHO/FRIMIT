import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typography } from '@/constants/design-tokens';

/**
 * 디자인 타이포 스케일을 그대로 쓰는 텍스트.
 *
 * **서체 선택이 이 파일의 전부다.** Manrope에는 한글 글리프가 없는데 이 앱 카피의
 * 대부분은 한글이다. `fontFamily: 'Manrope_...'`를 한글에 걸면 iOS는 조용히 시스템
 * 얼굴로 떨어지지만 weight가 함께 날아가고, Android는 글자가 깨지거나 굵기가 붙지
 * 않는다. 그래서 기본값은 **서체를 지정하지 않고 weight만 주는 것**이다 —
 * 시스템 한글 얼굴(Apple SD Gothic Neo / Noto Sans KR)이 weight를 제대로 그린다.
 *
 * Manrope는 한글이 나올 수 없는 자리에만 건다: 큰 숫자, 영문 라벨, mono 메타데이터.
 * 그 자리는 variant로 이미 구분되므로 대개 신경 쓸 필요가 없고, 영문 헤드라인처럼
 * 예외가 필요할 때만 `font="display"`를 준다.
 */

export type TextVariant = keyof typeof typography & string;

type Tone = keyof typeof colors.text | 'accent' | 'cyan' | 'over' | 'stale' | 'achievement';

const TONES: Record<Tone, string> = {
  primary: colors.text.primary,
  secondary: colors.text.secondary,
  body: colors.text.body,
  muted: colors.text.muted,
  metadata: colors.text.metadata,
  faint: colors.text.faint,
  disabled: colors.text.disabled,
  onLight: colors.text.onLight,
  accent: colors.accent.violetPale,
  cyan: colors.accent.cyan,
  over: colors.state.overLimit,
  stale: colors.state.staleSync,
  achievement: colors.state.achievement,
};

/** 한글이 섞일 수 없는 자리. 여기만 Manrope를 건다. */
const NUMERIC_VARIANTS = new Set<string>([
  'heroNumber',
  'heroNumberMd',
  'heroNumberSm',
  'cardNumber',
  'memberNumber',
  'numericLabel',
  'eyebrow',
  'badge',
]);

const MANROPE: Record<string, string> = {
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  '700': 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
};

function manropeFor(weight: TextStyle['fontWeight']): string {
  return MANROPE[String(weight ?? '700')] ?? 'Manrope_700Bold';
}

type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: Tone;
  /** `auto`(기본, 한글 안전) · `display`(Manrope 강제) · `mono`(JetBrains Mono) */
  font?: 'auto' | 'display' | 'mono';
  children?: ReactNode;
};

export function AppText({
  variant = 'body',
  tone = 'primary',
  font = 'auto',
  style,
  ...rest
}: AppTextProps) {
  const base = typography[variant] as TextStyle;
  const numeric = NUMERIC_VARIANTS.has(variant);

  const family =
    font === 'mono' || (variant === 'numericLabel' && font === 'auto')
      ? 'JetBrainsMono_500Medium'
      : font === 'display' || numeric
        ? manropeFor(base.fontWeight)
        : undefined;

  // fontFamily가 굵기까지 결정하는 자리에서 fontWeight를 함께 주면 Android가
  // 가짜 볼드를 덧씌운다. 그 자리에서는 weight를 걷어낸다.
  const resolved: TextStyle = family
    ? { ...base, fontFamily: family, fontWeight: undefined }
    : base;

  return (
    <Text
      // 큰 숫자는 링 안쪽 기하에 묶여 있어 글자 크기 설정을 따라 커지면 넘친다.
      // 나머지는 사용자의 접근성 설정을 존중한다.
      allowFontScaling={!numeric || variant === 'eyebrow' || variant === 'badge'}
      style={[
        resolved,
        { color: TONES[tone] },
        // 숫자가 애니메이션 중에 폭이 흔들리지 않게 한다.
        numeric ? styles.tabular : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
