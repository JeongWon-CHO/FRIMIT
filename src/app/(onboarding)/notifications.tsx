import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OnboardingFrame, SampleRow, StepProgress } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { markProgress } from '@/lib/onboarding';

/**
 * 04 · 알림 사전 설명.
 *
 * OS가 묻기 전에 **왜 필요한지** 먼저 말한다. 시스템 시트는 우리가 그리지 않고,
 * 우리 몫은 그 앞 화면과 뒤 화면뿐이다(PERMISSION_FLOW_SPEC).
 *
 * ⚠️ 지금 이 화면은 실제로 권한을 요청하지 않는다. `expo-notifications`가
 * 프로젝트에 없고 푸시 발송 인프라(토큰 테이블·서버)도 없다. 켜든 넘기든 05로
 * 간다는 점은 스펙과 같으므로 흐름은 지금도 정확하다 — 붙일 때 바뀌는 것은
 * `turnOn` 안쪽 한 줄이다.
 */
export default function NotificationIntroScreen() {
  const advance = async () => {
    await markProgress({ notificationsSeen: true });
    router.push('/privacy');
  };

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 380, opacity: 0.3, x: 100, y: 120 }}
      footer={
        <ButtonStack>
          <GradientButton label="Turn on notifications" onPress={advance} />
          <GradientButton label="Not now" variant="tertiary" onPress={advance} />
        </ButtonStack>
      }>
      <View style={styles.top}>
        <StepProgress total={3} current={2} />

        <AppText variant="screenTitle" style={styles.title}>
          우리 시간이 얼마 남았는지{'\n'}놓치지 않도록
        </AppText>
        <AppText variant="body" tone="muted">
          중요한 순간에만 알려드려요. 하루에 몇 번이면 충분해요.
        </AppText>

        <View style={styles.rows}>
          <SampleRow title="밤샘 금지단 · 75% 사용" caption="2시간 남았어요" emphasis />
          <SampleRow title="도형이가 콕 찔렀어요 👀" caption="방금" />
          <SampleRow title="목표 진행 64%" caption="이번 주 5번 운동하기" />
        </View>
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 26 },
  title: { fontSize: 30, lineHeight: 38 },
  rows: { gap: 10 },
});
