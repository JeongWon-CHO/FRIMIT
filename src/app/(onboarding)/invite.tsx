import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { BackButton, OnboardingFrame } from '@/components/onboarding';
import { AppText, ButtonStack, EmptyState, GradientButton, StatusDot } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { useJoinGroup } from '@/hooks/use-groups';

/**
 * 08 · 초대장.
 *
 * 이미 존재하는 그룹의 문 앞이다. **자리 하나가 비어 있고 그게 내 자리다.**
 *
 * 참여하기 전에는 그룹 정보를 읽을 수 없다 — RLS가 멤버에게만 그룹을 보여주고,
 * 그건 맞는 설계다. 그래서 이 화면은 초대 코드만 들고 서 있고, 실제 이름과 인원은
 * 참여한 뒤에 나온다. 미리 보여주려면 코드로 그룹 요약을 돌려주는 RPC가 따로
 * 필요하다(이번 범위 밖).
 */
const ORBIT = 270;

export default function InvitationPreviewScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const join = useJoinGroup();

  const accept = async () => {
    await join.mutateAsync((code ?? '').trim());
    router.replace('/tracking');
  };

  if (!code || code.length !== 6) {
    return (
      <OnboardingFrame
        footer={<GradientButton label="코드로 참여하기" onPress={() => router.replace('/start')} />}>
        <View />
        <EmptyState title="초대가 만료됐어요" body="친구에게 새 코드를 받아 주세요." />
        <View />
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 420, opacity: 0.34, x: 169, y: 200 }}
      footer={
        <ButtonStack>
          {join.error && (
            <AppText variant="metadata" tone="over">
              {join.error instanceof Error ? join.error.message : String(join.error)}
            </AppText>
          )}
          <GradientButton label="Join the group" onPress={accept} loading={join.isPending} />
          <GradientButton
            label="먼저 둘러볼게요"
            variant="tertiary"
            onPress={() => router.replace('/')}
          />
        </ButtonStack>
      }>
      <View style={styles.navRow}>
        <BackButton />
        <View style={styles.navSpacer} />
      </View>

      <View style={styles.top}>
        <AppText variant="metadata" tone="muted">
          초대 코드
        </AppText>
        <AppText variant="screenTitle" font="mono" style={styles.code}>
          FRM-{code}
        </AppText>
      </View>

      <View style={styles.orbitBox}>
        <SharedOrbitRing
          size={ORBIT}
          progress={0.75}
          gradient={gradients.sharedPool.colors}
          showTrackDashes
          strokeRatio={0.12}>
          <AppText variant="heroNumberMd">8h</AppText>
          <AppText variant="metadata" tone="metadata">
            shared every day
          </AppText>
        </SharedOrbitRing>

        <OrbitSeats
          seats={[
            { id: 'a', name: '정', emoji: '🐣', ring: 'activity' },
            { id: 'b', name: '민', emoji: '🦊' },
            { id: 'c', name: '도', emoji: '🐧' },
            { id: 'me', name: '+', pending: true },
          ]}
          size={ORBIT}
          placement="outer"
          seatSize={36}
        />
      </View>

      <View style={styles.status}>
        <StatusDot color={colors.accent.violetSoft} />
        <AppText variant="bodyStrong" tone="muted">
          자리 하나가 비어 있어요
        </AppText>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSpacer: { width: 38 },
  top: { gap: 6, alignItems: 'center' },
  code: { fontSize: 30, lineHeight: 36, letterSpacing: 2 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
});
