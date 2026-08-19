import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';

/**
 * 버튼 셋.
 *
 * primary만 채도를 갖는다. 특히 권한 꺼짐 화면에서는 이 그라데이션이 **화면에서
 * 유일하게 채도 있는 요소**여야 한다(TODAY_STATE_SPEC §H). 그래서 secondary는
 * 유리, tertiary는 글자만이다.
 *
 * iOS의 색 있는 그림자로 후광을 만든다. Android는 색 그림자를 무시하는데,
 * `elevation`을 대신 쓰면 검정 위에 회색 상자가 생기므로 아무것도 하지 않는다 —
 * 후광이 없는 편이 잘못된 후광보다 낫다.
 */
type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary';
  disabled?: boolean;
  loading?: boolean;
  /** 온보딩 CTA는 16, 화면 안쪽 버튼은 14 */
  size?: 'md' | 'lg';
};

export function GradientButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  size = 'lg',
}: ButtonProps) {
  const inactive = disabled || loading;
  // md는 12가 바닥이다. 글자 lineHeight가 20이라 12+20+12 = 44 — 아래의 minHeight와
  // 정확히 같은 값이고, 더 줄여도 minHeight에 걸려 아무 일도 일어나지 않는다.
  const padding = size === 'lg' ? 16 : 12;

  if (variant === 'tertiary') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(inactive) }}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [styles.tertiary, pressed && styles.dim]}>
        <AppText variant="button" tone="muted">
          {label}
        </AppText>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.box,
        { paddingVertical: padding, paddingHorizontal: padding + 8 },
        variant === 'primary' ? styles.primaryHalo : styles.secondary,
        pressed && styles.dim,
        inactive && styles.disabled,
      ]}>
      {variant === 'primary' && (
        <LinearGradient
          colors={gradients.violetToBlue.colors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.18 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {loading ? (
        <ActivityIndicator color={colors.text.primary} />
      ) : (
        <AppText
          variant={size === 'lg' ? 'buttonLarge' : 'button'}
          tone={variant === 'primary' ? 'primary' : 'body'}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

/** 버튼 두세 개를 세로로 쌓는 자리. 간격 10이 온보딩 전체의 규칙이다. */
export function ButtonStack({ children }: { children: React.ReactNode }) {
  return <View style={styles.stack}>{children}</View>;
}

/*
 * 좌우 패딩은 위아래와 함께 인라인으로 준다(size에 따라 갈리기 때문이다).
 * 이 버튼은 대개 전체 폭으로 늘어나 있어서 좌우가 없어도 오래 티가 나지 않았는데,
 * `EmptyState`처럼 가운데 정렬된 자리에 놓이면 글자 폭까지 쪼그라들어 라벨이
 * 줄바꿈된다.
 */
const styles = StyleSheet.create({
  box: {
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
  },
  primaryHalo: Platform.select({
    ios: {
      shadowColor: '#6366F1',
      shadowOpacity: 0.7,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 0 },
    },
    default: {},
  }) as object,
  secondary: {
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  tertiary: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  dim: { opacity: 0.9 },
  disabled: { opacity: 0.4, shadowOpacity: 0 },
  stack: { gap: 10 },
});
