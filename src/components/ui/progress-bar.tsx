import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';

import { colors, gradients } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 링이 과할 때 쓰는 선형 진행 바.
 *
 * 세 높이만 존재한다: 히어로 12, 그룹 6, 멤버 5. 목록 안에서도 안전하다 —
 * SVG를 쓰지 않고 `<View>` + `LinearGradient`뿐이다.
 */
type ProgressBarProps = {
  /** 0..1. 넘겨도 1에서 멈춘다. */
  progress: number;
  height?: 12 | 6 | 5;
  gradient?: readonly string[];
  /** 끝에 붙는 밝은 점. 히어로에만. */
  tip?: boolean;
};

export function ProgressBar({
  progress,
  height = 6,
  gradient = gradients.sharedPool.colors,
  tip,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fillBox, { width: `${clamped * 100}%` }]}>
        <LinearGradient
          colors={gradient as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]}
        />
      </View>

      {/* 팁은 채움의 끝에 얹힌다. 채움 안에 두면 폭이 0일 때 함께 사라진다. */}
      {tip && clamped > 0 && (
        <View
          pointerEvents="none"
          style={[styles.tip, { left: `${clamped * 100}%`, top: height / 2 - 8 }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: hexToRgba('#FFFFFF', 0.065),
    overflow: 'visible',
    justifyContent: 'center',
  },
  fillBox: { height: '100%' },
  tip: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    backgroundColor: '#E0F2FE',
    ...Platform.select({
      ios: {
        shadowColor: colors.accent.cyan,
        shadowOpacity: 0.9,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
});
