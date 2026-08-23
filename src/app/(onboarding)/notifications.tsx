import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingFrame, SampleRow, StepProgress } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { markProgress } from '@/lib/onboarding';
import { requestPushPermission } from '@/lib/push';

/**
 * 04 · 알림 사전 설명.
 *
 * OS가 묻기 전에 **왜 필요한지** 먼저 말한다. 시스템 시트는 우리가 그리지 않고,
 * 우리 몫은 그 앞 화면과 뒤 화면뿐이다(PERMISSION_FLOW_SPEC).
 *
 * 거절해도 05로 간다. 알림은 이 앱을 쓰는 조건이 아니고, 여기서 막으면 사전
 * 설명 화면이 설명이 아니라 관문이 된다.
 *
 * 토큰은 여기서 적지 않는다. 기기 행이 있어야 적을 수 있고 그 행은 첫 동기화에서
 * 만들어지므로, `ensureDevice`가 오늘 화면에서 바로 이어받는다.
 */
export default function NotificationIntroScreen() {
  const [asking, setAsking] = useState(false);

  const advance = async () => {
    await markProgress({ notificationsSeen: true });
    router.push('/privacy');
  };

  const turnOn = async () => {
    setAsking(true);
    try {
      // 결과를 보고 갈라지지 않는다. 거절도 정상적인 답이고, 그 사실은 서버에
      // 토큰이 없다는 것으로 이미 표현된다.
      await requestPushPermission();
    } catch {
      // 시뮬레이터나 알림을 지원하지 않는 환경. 흐름을 막지 않는다.
    } finally {
      setAsking(false);
    }

    await advance();
  };

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 380, opacity: 0.3, x: 100, y: 120 }}
      footer={
        <ButtonStack>
          <GradientButton label="알림 켜기" onPress={turnOn} loading={asking} />
          <GradientButton label="나중에" variant="tertiary" onPress={advance} />
        </ButtonStack>
      }>
      <View style={styles.top}>
        <StepProgress total={4} current={2} />

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
