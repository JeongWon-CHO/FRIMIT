import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { useLeaveGroupPrompt } from '@/hooks/use-leave-group-prompt';
import { useMyProfile } from '@/hooks/use-profile';
import { useScreenGroup } from '@/hooks/use-screen-group';
import { useTrackingState } from '@/hooks/use-tracking';
import { avatarEmoji } from '@/lib/avatars';
import { markProgress } from '@/lib/onboarding';
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
  const group = useScreenGroup(groups.data, params.groupId);

  const members = useGroupMembers(group?.id);
  const tracking = useTrackingState(group?.id);
  const setReady = useSetReady(group?.id);
  const startGroup = useStartGroup();
  const leave = useLeaveGroupPrompt();

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

  /**
   * 대기실에서 나가는 문.
   *
   * 혼자 만든 그룹은 시작할 수 없다(2명 필요). 그 상태에서 나갈 길이 없으면
   * 온보딩이 막다른 골목이 된다 — 앱을 껐다 켜도 `resolveEntryRoute`가 여기로
   * 되돌려 보내기 때문에 더 그렇다.
   *
   * `done`을 찍는 이유가 그것이다. 이 사람은 혼자 할 수 있는 것을 다 했고, 남은
   * 것은 친구가 들어오는 일뿐이다. 디자인의 복구 분기도 시작한 그룹 없이 앱을
   * 둘러볼 수 있어야 한다고 말한다(ONBOARDING_NAVIGATION의 Recovery branch).
   */
  const browse = async () => {
    await markProgress({ done: true });
    router.replace('/');
  };

  const start = async () => {
    if (!group) return;
    await startGroup.mutateAsync(group.id);
    // 시작하는 순간부터 서버가 스냅샷을 받는다. 구간을 여기서 무장해 두지 않으면
    // 첫 값이 다음 앱 실행까지 밀린다.
    await armTracking(group.id, group.time_zone);
    router.replace({ pathname: '/started', params: { groupId: group.id } });
  };

  /*
    그룹이 없으면 아무 분기에도 들어가지 않는다.
    
    그룹을 접으면 목록이 비는데 이 화면은 아직 물러나는 중이라 화면 위에 있다.
    그때 `isDraft`가 false가 되면서 대기실 분기로 떨어지면, 사라지는 그룹의
    자리에 빈 대기실이 한 번 그려진다. 여기서 조용히 멈추는 편이 맞다.
  */
  if (!group) {
    return (
      <OnboardingFrame>
        <View style={styles.navRow}>
          <BackButton />
        </View>
        <View />
        <View />
      </OnboardingFrame>
    );
  }

  // ── 14 · 대기실 ────────────────────────────────────────────────
  if (inWaitingRoom || !isDraft) {
    return (
      <OnboardingFrame
        ambient={{ color: colors.accent.violet, size: 420, opacity: 0.34, x: 169, y: 240 }}
        footer={
          <ButtonStack>
            {isDraft && isAdmin ? (
              <GradientButton
                label="우리 시간 시작하기"
                onPress={start}
                disabled={!canStart}
                loading={startGroup.isPending}
              />
            ) : isDraft ? (
              <AppText variant="bodyStrong" tone="muted" style={styles.waitLine}>
                관리자가 시작하기를 기다리는 중
              </AppText>
            ) : (
              <GradientButton label="홈으로 가기" onPress={() => router.replace('/')} />
            )}
            {isDraft && !canStart && (
              <AppText variant="metadata" tone="faint" style={styles.note}>
                {READY_MEMBERS_TO_START}명 이상 준비되면 시작할 수 있어요.
              </AppText>
            )}
            {isDraft && <GradientButton label="먼저 둘러보기" variant="tertiary" onPress={browse} />}
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
            <LeaveButton
              disabled={!group || leave.isPending}
              onPress={() => group && leave.prompt(group, members.data, profile.data?.id)}
            />
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

          {/*
            준비를 마쳤는데 아직 시작할 수 없으면 **홈이 다음 자리**다.
            실제 흐름은 한 사람이 먼저 깔고 초대 코드를 보낸 뒤 친구가 몇 시간
            뒤에 들어오는 것이다. 그 사이를 대기실에서 보내게 하면, 할 수 있는
            일이 하나도 없는 화면에 사람을 세워 두는 셈이 된다.

            정족수가 차면 반대가 된다 — 시작 버튼이 대기실에 있으므로 그쪽이
            먼저다. 지금 할 수 있는 일이 언제나 primary다.
          */}
          {me?.is_ready && !blockedReason && !canStart && (
            <GradientButton label="홈으로 가기" onPress={browse} />
          )}

          <GradientButton
            label="대기실로 가기"
            variant={me?.is_ready && !blockedReason && canStart ? 'primary' : 'secondary'}
            onPress={() => setInWaitingRoom(true)}
          />
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          <BackButton />
          <LeaveButton
            disabled={!group || leave.isPending}
            onPress={() => group && leave.prompt(group, members.data, profile.data?.id)}
          />
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

/**
 * 그룹을 접는 문.
 *
 * 시작 전 그룹은 상세 화면으로 갈 수 없어서(오늘 화면의 카드가 여기로 온다)
 * 나가는 문이 여기 없으면 만들어 본 그룹을 정리할 방법이 없다.
 */
function LeaveButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="그룹 나가기"
      hitSlop={8}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.moreButton, pressed && styles.morePressed]}>
      <AppText variant="bodyStrong" tone="body">
        ···
      </AppText>
    </Pressable>
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
  moreButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  morePressed: { opacity: 0.7 },
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
