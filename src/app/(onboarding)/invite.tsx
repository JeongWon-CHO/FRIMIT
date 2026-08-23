import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { BackButton, CodeEntryField, OnboardingFrame } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton, StatusDot } from '@/components/ui';
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
 *
 * **코드 입력도 여기서 한다.** 07의 카드 안에서 받으려 했더니 키보드가 올라오는
 * 순간 입력칸이 키보드와 버튼 사이에 끼었다. 화면 하나를 통째로 쓰면 그럴 일이
 * 없다 — 제목 하나, 상자 여섯 개, 그 아래는 전부 키보드 자리다.
 *
 * 여섯 자리가 차도 **바로 넘어가지 않는다.** 마지막 숫자를 잘못 눌렀을 때 화면이
 * 먼저 넘어가 버리면, 고치려는 사람이 뒤로 가기를 찾아야 한다. 다 넣으면 버튼이
 * 살아나고, 넘어가는 것은 그 버튼이 정한다.
 */
const ORBIT = 270;

export default function InvitationPreviewScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => (params.code ?? '').replace(/\D/g, '').slice(0, 6));

  // 코드를 다 넣고 초대장까지 왔는가. 링크로 온전한 코드를 들고 왔으면 입력 단계를
  // 건너뛴다 — 그 사람은 이미 코드를 넣은 셈이다.
  const [confirmed, setConfirmed] = useState(() => code.length === 6);

  const join = useJoinGroup();

  const accept = async () => {
    // 방금 참여한 그룹의 id를 실어 보낸다. 없으면 추적 화면이 목록의 첫 그룹으로
    // 떨어져서, 이미 그룹이 있는 사람이 **엉뚱한 그룹의 추적 대상**을 고른다.
    const joined = await join.mutateAsync(code);
    router.replace({ pathname: '/tracking', params: { groupId: joined.id } });
  };

  if (!confirmed) {
    return (
      <OnboardingFrame
        footer={
          <GradientButton
            label="참여하기"
            onPress={() => setConfirmed(true)}
            disabled={code.length !== 6}
          />
        }>
        <View style={styles.entry}>
          <BackButton />

          <AppText variant="screenTitle" style={styles.entryTitle}>
            초대 코드를 넣어 주세요
          </AppText>
          <AppText variant="body" tone="muted">
            친구가 보낸 여섯 자리 숫자예요.
          </AppText>

          <View style={styles.entryField}>
            <CodeEntryField value={code} onChange={setCode} />
          </View>
        </View>

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
          <GradientButton label="그룹 참여하기" onPress={accept} loading={join.isPending} />
          <GradientButton
            label="먼저 둘러볼게요"
            variant="tertiary"
            onPress={() => router.replace('/')}
          />
        </ButtonStack>
      }>
      <View style={styles.navRow}>
        {/* 뒤로는 화면을 떠나는 것이 아니라 코드를 고치러 가는 것이다. 숫자는
            그대로 둔다 — 오타 하나는 한 글자만 고치면 되는 일이다. */}
        <BackButton onPress={() => setConfirmed(false)} />
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
            매일 함께 쓰는 시간
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
  entry: { gap: 10 },
  entryTitle: { fontSize: 30, lineHeight: 38, paddingTop: 8 },
  // 상자를 제목 바로 아래에 둔다. 아래는 전부 키보드 자리다.
  entryField: { paddingTop: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSpacer: { width: 38 },
  top: { gap: 6, alignItems: 'center' },
  code: { fontSize: 30, lineHeight: 36, letterSpacing: 2 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
});
