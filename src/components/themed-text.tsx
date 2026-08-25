import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { colors } from '@/constants/design-tokens';
import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 타입 역할은 셋으로 나뉜다.
 *
 * - 표시용(`display`·`metric`): iOS `ui-rounded`. 숫자가 주인공인 화면이라
 *   시간 값에만 쓴다. Android는 시스템 산스로 떨어진다.
 * - 본문용(`default`·`small`…): 시스템 산스.
 * - 계측용(`code`·`label`): 모노와 자간 넓힌 소문자 라벨. 마지막 동기화 시각처럼
 *   "기계가 적은 값"에만 붙여 본문과 구분한다.
 *
 * 시간 숫자는 `tabular-nums`를 강제한다. 1초마다 다시 그리는 값에서 자폭이
 * 흔들리면 숫자가 춤춘다.
 */
export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | 'display'
    | 'metric'
    | 'label';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'display' && styles.display,
        type === 'metric' && styles.metric,
        type === 'label' && styles.label,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: colors.text.link,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  display: {
    fontFamily: Fonts.sans,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: 700,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  metric: {
    fontFamily: Fonts.sans,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
    letterSpacing: 0.6,
  },
});
