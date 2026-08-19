import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/constants/design-tokens';

/**
 * 38px 원형 뒤로 가기.
 *
 * 온보딩 스택은 헤더를 쓰지 않으므로(전환이 `fade`라 헤더가 밀려 들어오면
 * 어색하다) 각 화면이 이걸 직접 그린다. 어디에 붙이고 어디에 안 붙이는지는
 * `ONBOARDING_NAVIGATION.md`의 back 표를 따른다 — 권한 흐름(04·05·06)과
 * 시스템 피커 앞뒤(11·12)에는 붙이지 않는다. 반쯤 끝난 권한 흐름이 제일 나쁘다.
 *
 * 스택 바닥에서 눌렸을 때 아무 일도 일어나지 않으면 막다른 골목이 된다.
 * 돌아갈 곳이 없으면 오늘 화면으로 보낸다.
 */
export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로"
      hitSlop={8}
      onPress={
        onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))
      }
      style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
      <AppText variant="bodyStrong" tone="body">
        ←
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  pressed: { opacity: 0.7 },
});
