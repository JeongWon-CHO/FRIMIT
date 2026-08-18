import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { BackButton, OnboardingFrame, ReadinessRow } from '@/components/onboarding';
import {
  AppText,
  ButtonStack,
  GradientButton,
  ProgressBar,
  StatusDot,
  StatusPill,
} from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import {
  readyCount,
  useGroupMembers,
  useMyGroups,
  useSetReady,
  useStartGroup,
} from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useTrackingState } from '@/hooks/use-tracking';
import { avatarEmoji } from '@/lib/avatars';
import { formatShort } from '@/lib/format';
import { READY_MEMBERS_TO_START } from '@/lib/groups';
import { armTracking, isUsable } from '@/lib/tracking';

/**
 * 13 · 준비 상태 → 14 · 대기실.
 *
 * 온보딩의 마지막이면서, 오늘 화면의 시작 대기 카드가 눌렸을 때 오는 화면이기도
 * 하다(`?groupId=`). 시작 대기는 며칠 걸릴 수 있는 상태라 온보딩 안에만 두면
 * 갈 곳이 없다.
 *
 * 준비 완료를 켤 수 있는 조건은 클라이언트가 지킨다. 서버의 `is_ready`는 멤버가
 * 직접 UPDATE하는 유일한 컬럼이라 "권한 있고 대상을 골랐는가"를 검사하지 않는다.
 * 그 규칙은 제품 쪽에 있다 — 이걸 화면이 안 막으면 아무것도 올리지 못하는 사람이
 * 시작 정족수를 채우고, 그룹은 시작됐는데 공동 풀은 비어 있는 상태가 된다.
 *
 * ⚠️ 다른 멤버의 칩(`✓ Screen Time`, `✓ 6 apps`)은 그릴 수 없다. 앱 개수는 서버로
 * 올라가지 않고, 권한 상태는 그 사람이 한 번이라도 올린 뒤에만 알 수 있다.
 * 그래서 칩은 내 줄에만 붙는다.
 */
const ORBIT = 280;

export default function ReadinessScreen() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  /**
   * 13에서 버튼을 눌러 14로 넘어왔는가.
   *
   * 집계 중인 그룹은 이 값 없이도 14를 그린다(13은 시작 전에만 의미가 있다).
   * 그래서 이 값이 참일 때만 뒤로 가기가 13으로 돌아가고, 아니면 화면을 떠난다.
   */
  const [inWaitingRoom, setInWaitingRoom] = useState(false);

  const profile = useMyProfile();
  const groups = useMyGroups();
  const group =
    groups.data?.find((candidate) => candidate.id === params.groupId) ?? groups.data?.[0];

  const members = useGroupMembers(group?.id);
  const tracking = useTrackingState(group?.id);
  const setReady = useSetReady(group?.id);
  const startGroup = useStartGroup();

  const me = members.data?.find((member) => member.profile_id === profile.data?.id);
  const ready = readyCount(members.data);
  const total = members.data?.length ?? 1;
  const canStart = ready >= READY_MEMBERS_TO_START;
  const isAdmin = group?.admin_id === profile.data?.id;
  const isDraft = group?.status === 'draft';

  const blockedReason = !isUsable(tracking.permission)
    ? 'Waiting for Screen Time'
    : tracking.selectionCount === 0
      ? 'Waiting for app selection'
      : null;

  const start = async () => {
    if (!group) return;
    await startGroup.mutateAsync(group.id);
    // 시작하는 순간부터 서버가 스냅샷을 받는다. 구간을 여기서 무장해 두지 않으면
    // 첫 값이 다음 앱 실행까지 밀린다.
    await armTracking(group.id, group.time_zone);
    router.replace({ pathname: '/started', params: { groupId: group.id } });
  };

  // ── 14 · 대기실 ────────────────────────────────────────────────
  if (inWaitingRoom || !isDraft) {
    return (
      <OnboardingFrame
        ambient={{ color: colors.accent.violet, size: 420, opacity: 0.34, x: 169, y: 240 }}
        footer={
          <ButtonStack>
            {isDraft && isAdmin ? (
              <GradientButton
                label="Start our pool"
                onPress={start}
                disabled={!canStart}
                loading={startGroup.isPending}
              />
            ) : isDraft ? (
              <AppText variant="bodyStrong" tone="muted" style={styles.waitLine}>
                관리자가 시작하기를 기다리는 중
              </AppText>
            ) : (
              <GradientButton label="See today" onPress={() => router.replace('/')} />
            )}
            {isDraft && !canStart && (
              <AppText variant="metadata" tone="faint" style={styles.note}>
                {READY_MEMBERS_TO_START}명 이상 준비되면 시작할 수 있어요.
              </AppText>
            )}
          </ButtonStack>
        }>
        <View style={styles.top}>
          <View style={styles.navRow}>
            {/*
              대기실은 며칠 머무를 수 있는 자리다. 관리자가 아니고 준비 인원도
              모자라면 누를 수 있는 버튼이 하나도 없어서, 뒤로 가기가 없으면
              앱을 껐다 켜는 것 말고는 나갈 방법이 없다.
            */}
            <BackButton
              onPress={() => {
                if (inWaitingRoom) setInWaitingRoom(false);
                else if (router.canGoBack()) router.back();
                else router.replace('/');
              }}
            />
            <StatusPill label={group?.name ?? '…'} dotColor={colors.accent.violetSoft} />
            <View style={styles.navSpacer} />
          </View>

          <AppText variant="greeting" style={styles.center}>
            {canStart ? '다 모였어요' : '친구를 기다리는 중'}
          </AppText>
        </View>

        <View style={styles.orbitBox}>
          <SharedOrbitRing
            size={ORBIT}
            progress={total > 0 ? ready / total : 0}
            gradient={gradients.sharedPool.colors}
            showTrackDashes
            strokeRatio={0.12}>
            <AppText variant="heroNumberMd">{formatShort(28800)}</AppText>
            <AppText variant="bodyStrong" tone="metadata">
              shared every day
            </AppText>
          </SharedOrbitRing>

          <OrbitSeats
            seats={(members.data ?? []).map((member) => ({
              id: member.profile_id,
              name: member.nickname,
              emoji: avatarEmoji(member.avatar_key),
              pending: !member.is_ready,
              ring: member.is_ready ? ('activity' as const) : ('none' as const),
            }))}
            size={ORBIT}
            placement="outer"
            seatSize={38}
          />
        </View>

        <View style={styles.status}>
          <StatusDot color={colors.accent.cyan} />
          <AppText variant="bodyStrong" tone="muted">
            {ready} friends ready · {total - ready}명 준비 중
          </AppText>
        </View>
      </OnboardingFrame>
    );
  }

  // ── 13 · 준비 상태 ─────────────────────────────────────────────
  return (
    <OnboardingFrame
      footer={
        <ButtonStack>
          {!me?.is_ready && !blockedReason && (
            <GradientButton
              label="준비 완료"
              onPress={() => setReady.mutate(true)}
              loading={setReady.isPending}
            />
          )}
          {blockedReason && (
            <GradientButton
              label={isUsable(tracking.permission) ? '앱 고르기' : '권한 켜기'}
              onPress={() =>
                router.push(isUsable(tracking.permission) ? '/tracking' : '/permission')
              }
            />
          )}
          <GradientButton
            label="Go to waiting room"
            variant={me?.is_ready && !blockedReason ? 'primary' : 'secondary'}
            onPress={() => setInWaitingRoom(true)}
          />
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          <BackButton />
          <View style={styles.navSpacer} />
        </View>

        <AppText variant="screenTitle" style={styles.title}>
          {group?.name ?? '…'}
        </AppText>

        <View style={styles.readyRow}>
          <AppText variant="bodyStrong" tone="accent">
            {ready} of {total} ready
          </AppText>
          <View style={styles.bar}>
            <ProgressBar progress={total > 0 ? ready / total : 0} height={5} />
          </View>
        </View>

        <View style={styles.rows}>
          {(members.data ?? []).map((member) => {
            const self = member.profile_id === profile.data?.id;

            return (
              <ReadinessRow
                key={member.profile_id}
                id={member.profile_id}
                name={`${member.nickname}${self ? ' (나)' : ''}`}
                emoji={avatarEmoji(member.avatar_key)}
                state={
                  member.is_ready ? (self ? 'self-ready' : 'ready') : 'pending'
                }
                // 칩은 내 줄에만. 남의 설정 내역을 늘어놓는 화면이 아니다.
                chips={
                  self && member.is_ready
                    ? ['✓ Screen Time', `✓ ${tracking.selectionCount} apps`]
                    : undefined
                }
                pendingReason={self ? (blockedReason ?? '준비 대기') : '준비 대기'}
              />
            );
          })}
        </View>
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 8 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  // 알약이 가운데에 오도록 오른쪽에 같은 폭을 비워 둔다.
  navSpacer: { width: 38 },
  title: { fontSize: 30, lineHeight: 38 },
  center: { textAlign: 'center' },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  bar: { flex: 1 },
  rows: { gap: 10, paddingTop: 6 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  waitLine: { textAlign: 'center', paddingVertical: 14 },
  note: { textAlign: 'center' },
});
