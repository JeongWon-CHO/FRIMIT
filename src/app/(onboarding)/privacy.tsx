import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OnboardingFrame, PrivacyDisclosureCard, StepProgress } from '@/components/onboarding';
import { AppText, GradientButton } from '@/components/ui';

/**
 * 05 · 프라이버시 설명. **권한을 얻어 내는 화면이다.**
 *
 * 06보다 먼저 나와야 하고 딥링크로도 건너뛸 수 없다(PERMISSION_FLOW_SPEC §2).
 *
 * 아래 세 앱 이름은 **고정된 예시**다. 사용자의 실제 사용 기록을 넣으면 이 화면이
 * 약속하는 바로 그것을 깨뜨린다.
 */
export default function PrivacyIntroScreen() {
  return (
    <OnboardingFrame
      texture="calm"
      footer={<GradientButton label="다음" onPress={() => router.push('/permission')} />}>
      <View style={styles.top}>
        <StepProgress total={4} current={3} />

        <AppText variant="screenTitle" style={styles.title}>
          시간만 공유하고{'\n'}목록은 남기지 않아요
        </AppText>
        <AppText variant="body" tone="muted">
          공동 시간을 계산하려면 Screen Time 데이터가 필요해요.
        </AppText>

        {/*
          미리보기 값은 실제 화면이 그리는 문장과 같아야 한다. 동기화 시각은
          `formatSyncAge`가 "2분 전 동기화"로 만든다 — 여기만 영어로 두면 방금 본
          예시와 다음 화면의 실제가 다른 말을 하게 된다.
        */}
        <PrivacyDisclosureCard
          tone="visible"
          eyebrow="친구에게 보여요"
          headline="1h 42m 사용"
          chips={['앱 6개', '2분 전 동기화']}
        />

        <PrivacyDisclosureCard
          tone="hidden"
          eyebrow="친구에게 안 보여요"
          rows={[
            { label: 'Instagram', value: '48m' },
            { label: 'YouTube', value: '32m' },
            { label: 'KakaoTalk', value: '22m' },
          ]}
          note="앱별 상세 기록은 이 기기에만 남아요."
        />
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 22 },
  title: { fontSize: 30, lineHeight: 38 },
});
