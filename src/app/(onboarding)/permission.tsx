import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { OnboardingStep } from '@/components/onboarding-step';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrackingState } from '@/hooks/use-tracking';
import { markProgress } from '@/lib/onboarding';
import { describePermission, requestPermission } from '@/lib/tracking';

/**
 * 3단계 · 사용량 권한.
 *
 * 권한을 요청하기 전에 **무엇이 그룹에 보이는지** 먼저 말한다. 이 앱이 읽는 것은
 * 앱별 사용시간이고 그건 대부분의 사용자에게 민감한 값이다. 실제로 그룹에 나가는
 * 것은 개수·합계·마지막 동기화 시각·권한 상태뿐이므로(plan.md 24행), 그 사실을
 * 권한 시트보다 먼저 보여주는 것이 순서다.
 *
 * 거부해도 막지 않는다(plan.md 71행). 다만 공동 집계의 준비 멤버로는 인정되지
 * 않으므로, 그 결과를 여기서 미리 알려 준다.
 */
export default function PermissionScreen() {
  const theme = useTheme();
  const tracking = useTrackingState(undefined);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const granted = tracking.permission === 'granted';

  const ask = async () => {
    setRequesting(true);
    setError(null);
    try {
      await requestPermission();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      // 시트를 취소해도 상태를 다시 읽어야 한다. iOS는 취소를 오류로 알려주지 않는다.
      tracking.refresh();
      setRequesting(false);
    }
  };

  const skip = async () => {
    await markProgress({ permissionSkipped: true });
    router.push('/group');
  };

  return (
    <OnboardingStep
      step="permission"
      eyebrow="권한"
      title="사용시간을 읽어도 될까요"
      description={
        Platform.OS === 'ios'
          ? '스크린 타임 권한이 필요해요. 애플이 그리는 화면에서 허용해 주세요.'
          : '사용 정보 접근 권한이 필요해요. 설정 화면이 열리면 목록에서 Frimit을 찾아 켜 주세요.'
      }
      footer={
        granted ? (
          <Button label="다음" onPress={() => router.push('/group')} />
        ) : (
          <>
            <Button label="권한 허용하기" onPress={ask} loading={requesting} />
            <Button label="나중에 하기" variant="plain" onPress={skip} />
          </>
        )
      }>
      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          친구들에게 보이는 것
        </ThemedText>
        <Line theme="text" text="합계 사용시간 · 고른 앱 개수 · 마지막 동기화 시각" />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <ThemedText type="label" themeColor="textSecondary">
          기기에만 남는 것
        </ThemedText>
        <Line theme="textSecondary" text="어떤 앱을 골랐는지 · 앱 이름 · 앱별 사용시간" />
      </Card>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          지금 상태
        </ThemedText>
        <ThemedText type="small" themeColor={granted ? 'positive' : 'caution'}>
          {describePermission(tracking.permission)}
        </ThemedText>
        {!granted && (
          <ThemedText type="small" themeColor="textSecondary">
            권한이 없어도 앱은 그냥 쓸 수 있어요. 대신 공동 풀 집계에는 들어가지 않아서, 친구들
            화면에는 &apos;동기화 불가&apos;로 보여요.
          </ThemedText>
        )}
      </Card>

      {error ? (
        <ThemedText type="small" themeColor="over">
          {error}
        </ThemedText>
      ) : null}
    </OnboardingStep>
  );
}

function Line({ text, theme }: { text: string; theme: 'text' | 'textSecondary' }) {
  return (
    <ThemedText type="small" themeColor={theme}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
});
