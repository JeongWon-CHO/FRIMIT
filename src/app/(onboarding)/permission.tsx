import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { SharedOrbitRing } from '@/components/orbit';
import { OnboardingFrame, StepProgress } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { gradients } from '@/constants/design-tokens';
import { markProgress } from '@/lib/onboarding';
import { describePermission, permissionButton, recoverPermission } from '@/lib/tracking';
import { useTrackingState } from '@/hooks/use-tracking';

/**
 * 06 · 스크린타임 권한 — 그리고 06a / 06b 복귀 화면.
 *
 * 한 라우트에 셋이 있다. 요청 전(`?result` 없음), 승인(`granted`), 거부(`denied`).
 * 세 화면의 뼈대가 같고(가운데 링 + 문구 + CTA) 바뀌는 것은 링과 카피뿐이라,
 * 라우트를 셋으로 나누면 같은 레이아웃을 세 번 쓰게 된다.
 *
 * **시스템 시트는 그리지 않는다.** 우리 몫은 그 앞과 뒤뿐이다.
 * 거부해도 막지 않는다 — 거부한 사람도 온보딩을 끝까지 지나간다.
 */
export default function PermissionScreen() {
  const { result } = useLocalSearchParams<{ result?: 'granted' | 'denied' }>();
  const tracking = useTrackingState(undefined);
  const [busy, setBusy] = useState(false);

  const granted = tracking.permission === 'granted';

  /*
   * 무슨 버튼을 보여주고 눌렀을 때 무엇을 할지는 `permission.ts` 한 곳이 정한다.
   * 이 화면이 따로 판단하면 오늘 화면·MY 탭과 규칙이 갈라진다 — 실제로 그랬고,
   * 여기서는 기기 정책으로 막힌 상태(restricted)까지 설정으로 보내고 있었다.
   * 거기서는 사용자가 바꿀 수 있는 것이 없다.
   */
  const cta = permissionButton(tracking.permission);

  const ask = async () => {
    setBusy(true);
    try {
      await recoverPermission(tracking.permission);
    } catch {
      // 사유는 상태로 다시 읽는다. iOS는 시트 취소를 오류로 알려주지 않는다.
    } finally {
      tracking.refresh();
      setBusy(false);
    }
  };

  // 시트가 닫히면 결과 화면으로 옮긴다. 권한 변화는 네이티브 이벤트와 앱 복귀로
  // 들어오므로(`lib/tracking.ts`), 여기서는 그 결과만 읽는다.
  useEffect(() => {
    if (!busy && result === undefined && granted) {
      router.replace({ pathname: '/permission', params: { result: 'granted' } });
    }
  }, [busy, granted, result]);

  /*
   * 온보딩의 끝. 여기서 홈으로 내보낸다.
   *
   * 예전에는 07(만들기·참여)로 밀었다. 그래서 온보딩이 끝난 자리에서 퍼널이
   * 하나 더 열렸고, 사용자는 끝난 줄 알았다가 다시 걷기 시작했다. 그룹 만들기는
   * 홈의 빈 상태에서 시작한다.
   */
  const next = async () => {
    if (!granted) await markProgress({ permissionSkipped: true });
    router.replace('/');
  };

  if (result === 'granted') {
    return (
      <Result
        ring={<SharedOrbitRing size={104} progress={1} gradient={gradients.sharedPool.colors} strokeRatio={0.16}>
          <AppText variant="screenTitle" tone="cyan">✓</AppText>
        </SharedOrbitRing>}
        title="권한이 연결됐어요"
        body="이제 공동 시간에 참여할 수 있어요."
        primary={{ label: '다음', onPress: next }}
      />
    );
  }

  if (result === 'denied') {
    return (
      <Result
        calm
        ring={<SharedOrbitRing size={104} progress={0} variant="empty" gradient={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)']} glow="none" strokeRatio={0.16}>
          <AppText variant="cardNumber" tone="faint">— —</AppText>
        </SharedOrbitRing>}
        title="아직 참여 전이에요"
        body="둘러보는 건 괜찮아요. 공동 시간 집계는 권한을 켠 뒤부터 시작돼요."
        // 켤 수 없는 상태에는 버튼을 만들지 않는다. 넘어가는 문만 남는다.
        primary={cta ? { label: cta.label, onPress: ask } : undefined}
        secondary={{ label: '일단 넘어가기', onPress: next }}
      />
    );
  }

  return (
    <OnboardingFrame
      texture="calm"
      footer={
        <ButtonStack>
          {cta && <GradientButton label={cta.label} onPress={ask} loading={busy} />}
          <GradientButton label="일단 넘어가기" variant="tertiary" onPress={next} />
          <AppText variant="metadata" tone="faint" style={styles.note}>
            다음 화면은 {Platform.OS === 'ios' ? 'iOS' : 'Android'} 시스템 시트예요.
          </AppText>
        </ButtonStack>
      }>
      <StepProgress total={4} current={4} />

      <View style={styles.center}>
        <SharedOrbitRing
          size={170}
          progress={0.11}
          gradient={gradients.violetToBlue.colors}
          glow="none"
          strokeRatio={0.14}>
          <AppText variant="heroNumberSm" tone="faint" style={styles.dash}>
            — —
          </AppText>
          <AppText variant="numericLabel" tone="faint">
            아직 기록 없음
          </AppText>
        </SharedOrbitRing>

        <View style={styles.copy}>
          <AppText variant="screenTitle" style={styles.title}>
            마지막 한 단계
          </AppText>
          <AppText variant="body" tone="muted" style={styles.center}>
            권한을 켜면 내 사용 시간이 그룹의 공동 시간에 합산돼요. 언제든 끌 수 있어요.
          </AppText>
          <AppText variant="metadata" tone="faint" style={styles.note}>
            {describePermission(tracking.permission)}
          </AppText>
        </View>
      </View>

      <View />
    </OnboardingFrame>
  );
}

/** 06a·06b 공통 뼈대. 링과 카피만 다르다. */
function Result({
  ring,
  title,
  body,
  primary,
  secondary,
  calm,
}: {
  ring: React.ReactNode;
  title: string;
  body: string;
  /** 켤 수 없는 상태에서는 없다 — 눌러도 아무 일이 없는 버튼을 두지 않는다. */
  primary?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  calm?: boolean;
}) {
  return (
    <OnboardingFrame
      texture={calm ? 'calm' : 'screen'}
      footer={
        <ButtonStack>
          {primary && (
            <GradientButton
              label={primary.label}
              variant={calm ? 'primary' : 'secondary'}
              onPress={primary.onPress}
            />
          )}
          {secondary && (
            <GradientButton
              label={secondary.label}
              variant="tertiary"
              onPress={secondary.onPress}
            />
          )}
        </ButtonStack>
      }>
      <View />

      <View style={styles.center}>
        {ring}
        <AppText variant="greeting" style={styles.resultTitle}>
          {title}
        </AppText>
        <AppText variant="body" tone="muted" style={styles.center}>
          {body}
        </AppText>
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 14, textAlign: 'center' },
  copy: { alignItems: 'center', gap: 10, paddingTop: 8 },
  title: { fontSize: 28, lineHeight: 34 },
  resultTitle: { fontSize: 26, lineHeight: 32, paddingTop: 6 },
  dash: { letterSpacing: 2 },
  note: { textAlign: 'center' },
});
