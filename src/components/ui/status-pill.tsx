import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, radius as radii } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 알약 하나 — 그룹 정체성, 상태 라벨, 배지.
 *
 * 디자인의 `glass`는 블러가 아니라 `rgba(255,255,255,0.07)` 불투명 채움이다.
 * 근-검정 배경에서는 눈으로 구분되지 않고 스크롤에서 공짜다(RN_IMPLEMENTATION_NOTES).
 */
type Tone = 'glass' | 'violet' | 'cyan' | 'amber' | 'pink' | 'gold';

const TONE_COLORS: Record<Exclude<Tone, 'glass'>, string> = {
  violet: colors.accent.violetSoft,
  cyan: colors.accent.cyan,
  amber: colors.state.staleSync,
  pink: colors.state.overLimit,
  gold: colors.state.achievement,
};

type StatusPillProps = {
  label: string;
  /** 넣으면 6px 발광 점이 왼쪽에 붙는다. */
  dotColor?: string;
  tone?: Tone;
  size?: 'sm' | 'md';
};

export function StatusPill({ label, dotColor, tone = 'glass', size = 'md' }: StatusPillProps) {
  const accent = tone === 'glass' ? undefined : TONE_COLORS[tone];

  return (
    <View
      style={[
        styles.pill,
        dotColor ? styles.withDot : styles.withoutDot,
        size === 'sm' && styles.small,
        accent
          ? { backgroundColor: hexToRgba(accent, 0.12), borderColor: hexToRgba(accent, 0.27) }
          : { backgroundColor: colors.surface.glass, borderColor: colors.border.hairlineStrong },
      ]}>
      {dotColor && <StatusDot color={dotColor} />}
      <AppText variant="bodyStrong" style={styles.label} tone={accent ? 'primary' : 'body'}>
        {label}
      </AppText>
    </View>
  );
}

/** 발광하는 작은 점. iOS는 색 그림자, Android는 은은한 링으로 대신한다. */
export function StatusDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        Platform.OS === 'ios'
          ? { shadowColor: color, shadowOpacity: 0.85, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }
          : { borderWidth: 2, borderColor: hexToRgba(color, 0.25) },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  withDot: { paddingLeft: 9, paddingRight: 13, paddingVertical: 7 },
  withoutDot: { paddingHorizontal: 11, paddingVertical: 6 },
  small: { paddingVertical: 5 },
  /*
   * 크기를 줄이면 줄 높이도 함께 줄여야 한다.
   *
   * `bodyStrong`은 14/20이라, fontSize만 13으로 낮추면 13px 글자가 20px 줄상자에
   * 남는다. iOS는 줄 높이가 자연 높이보다 클 때 남는 공간을 **글자 위에** 몰아
   * 주므로, 글자가 아래로 앉아 알약 테두리에 닿는다.
   *
   * 16은 13의 1.23배다. 한글은 베이스라인 아래로 내려가는 획이 없어서(g·y 같은
   * 것이 없다) 이 정도면 잘리지 않고, 위아래 여백은 알약의 패딩이 만든다.
   */
  label: { fontSize: 13, lineHeight: 16 },
});
