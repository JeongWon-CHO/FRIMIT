import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton, CodeEntryField, OnboardingFrame } from '@/components/onboarding';
import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { AppText, ButtonStack, GradientButton, StatusDot } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { useGroupPreview, useJoinGroup } from '@/hooks/use-groups';
import { formatShort } from '@/lib/format';
import { GROUP_SEAT_LIMIT } from '@/lib/groups';

/**
 * 08 · 초대장.
 *
 * 두 장면이 한 화면에 있다. 코드를 넣는 동안과, 코드가 가리키는 그룹 앞에 선 뒤.
 * 장면을 가르는 것은 `preview.data`다 — **서버가 그룹이 있다고 답한 순간**에만
 * 두 번째 장면이 있다.
 *
 * 예전에는 여섯 자리가 채워지기만 하면 넘어갔고, 넘어간 화면의 이름도 인원도
 * 시간도 전부 고정값이었다. 아무 숫자나 통과했고, 틀렸다는 사실은 마지막 버튼을
 * 눌러야 알았다. 지금은 `group_preview`가 확인하고, 화면은 그 답만 그린다.
 *
 * **사람 얼굴은 없다.** 서버가 이름과 아바타를 주지 않는다 — 코드 공간이 100만이라
 * 전수 조회가 가능하고, 거기에 사람 이름이 실리면 안 된다(0825 마이그레이션).
 * 앉은 자리와 빈 자리의 수만으로도 "내가 아는 그 그룹인가"는 판별된다.
 *
 * 여섯 자리가 차도 **바로 넘어가지 않는다.** 마지막 숫자를 잘못 눌렀을 때 화면이
 * 먼저 넘어가 버리면, 고치려는 사람이 뒤로 가기를 찾아야 한다.
 */
const ORBIT = 270;

export default function InviteScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => (params.code ?? '').replace(/\D/g, '').slice(0, 6));

  const preview = useGroupPreview();
  const join = useJoinGroup();

  const group = preview.data;
  const failure = preview.error ?? join.error;

  const accept = () =>
    // 방금 참여한 그룹의 id를 실어 보낸다. 없으면 추적 화면이 목록의 첫 그룹으로
    // 떨어져서, 이미 그룹이 있는 사람이 **엉뚱한 그룹의 추적 대상**을 고른다.
    join.mutate(code, {
      onSuccess: (joined) =>
        router.replace({ pathname: '/tracking', params: { groupId: joined.id } }),
    });

  if (!group) {
    return (
      <OnboardingFrame
        footer={
          <ButtonStack>
            {failure && <Failure error={failure} />}
            <GradientButton
              label="참여하기"
              onPress={() => preview.mutate(code)}
              disabled={code.length !== 6}
              loading={preview.isPending}
            />
          </ButtonStack>
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
            <CodeEntryField
              value={code}
              onChange={(next) => {
                setCode(next);
                // 한 글자만 고쳐도 지난 실패는 더 이상 이 코드의 이야기가 아니다.
                if (preview.error) preview.reset();
                if (join.error) join.reset();
              }}
              error={Boolean(failure)}
            />
          </View>
        </View>

        <View />
      </OnboardingFrame>
    );
  }

  const freeSeats = Math.max(0, GROUP_SEAT_LIMIT - group.member_count);

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 420, opacity: 0.34, x: 169, y: 200 }}
      footer={
        <ButtonStack>
          {failure && <Failure error={failure} />}
          <GradientButton
            label="그룹 참여하기"
            onPress={accept}
            loading={join.isPending}
            disabled={freeSeats === 0}
          />
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
        <BackButton onPress={() => preview.reset()} />
        <View style={styles.navSpacer} />
      </View>

      <View style={styles.top}>
        <AppText variant="metadata" tone="muted">
          FRM-{code}
        </AppText>
        <AppText variant="screenTitle" style={styles.name}>
          {group.name}
        </AppText>
      </View>

      <View style={styles.orbitBox}>
        <SharedOrbitRing
          size={ORBIT}
          // 아크는 사용량이 아니라 **찬 자리**다. 참여 전에는 이 그룹의 사용량을
          // 볼 수 없고, 봐서도 안 된다.
          progress={group.member_count / GROUP_SEAT_LIMIT}
          gradient={gradients.sharedPool.colors}
          showTrackDashes
          strokeRatio={0.12}>
          <AppText variant="heroNumberMd">{formatShort(group.daily_limit_seconds)}</AppText>
          <AppText variant="metadata" tone="metadata">
            매일 함께 쓰는 시간
          </AppText>
        </SharedOrbitRing>

        <OrbitSeats
          seats={[
            // 이름 없는 자리다. 아바타는 '·' 하나를 띄운다.
            ...Array.from({ length: group.member_count }, (_, index) => ({
              id: `seat-${index}`,
            })),
            ...(freeSeats > 0 ? [{ id: 'me', name: '+', pending: true }] : []),
          ]}
          size={ORBIT}
          placement="outer"
          seatSize={36}
        />
      </View>

      <View style={styles.status}>
        <StatusDot color={colors.accent.violetSoft} />
        <AppText variant="bodyStrong" tone="muted">
          {freeSeats === 0
            ? '정원이 찼어요'
            : `${group.member_count}명이 함께 쓰는 중 · 빈 자리 ${freeSeats}개`}
        </AppText>
      </View>

      {/* 시작한 그룹에 들어가면 오늘의 공동 풀은 이미 남들의 시간을 담고 있다.
          서버가 가입을 다음 오전 6시로 예약하는 이유이고, 그건 참여를 누르기
          전에 알아야 하는 사실이다. */}
      <AppText variant="metadata" tone="metadata" style={styles.note}>
        {group.status === 'active'
          ? '이미 함께 쓰는 중이라, 내 시간은 다음 오전 6시부터 합쳐져요.'
          : '아직 시작 전이에요. 다 모이면 관리자가 시작해요.'}
      </AppText>
    </OnboardingFrame>
  );
}

function Failure({ error }: { error: unknown }) {
  return (
    <AppText variant="metadata" tone="over">
      {error instanceof Error ? error.message : String(error)}
    </AppText>
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
  name: { fontSize: 30, lineHeight: 36 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  note: { textAlign: 'center' },
});
