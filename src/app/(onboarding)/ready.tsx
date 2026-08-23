import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import {
  BackButton,
  StepProgress,
  InviteCodeCard,
  OnboardingFrame,
  ReadinessRow,
} from '@/components/onboarding';
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
 * **초대 코드가 여기 산다.** 예전에는 그룹을 만든 직후(10번 화면)에 코드를 건넸는데,
 * 그 화면의 주 버튼이 공유 시트라 온보딩에서 앱을 떠나는 유일한 지점이었다. 거기서
 * 안 돌아오면 추적 선택과 준비가 미완으로 남고, 시작 정족수(2명)를 채울 수 없어
 * **친구가 들어와도 그룹이 시작되지 않는다.** 초대를 대기실로 내리면 그 위험이
 * 사라진다 — 여기까지 온 사람은 혼자 할 수 있는 일을 이미 다 했고, 자리가 차는
 * 것을 보는 화면과 시작 버튼이 같은 자리에 있다.
 *
 * 그룹 상세의 "초대 코드 보기"도 원래부터 이 화면을 가리키고 있었다(`?invite=1`).
 * 정작 코드가 없어서 지키지 못하던 약속이다.
 *
 * 준비 완료를 켤 수 있는 조건은 클라이언트가 지킨다. 서버의 `is_ready`는 멤버가
 * 직접 UPDATE하는 유일한 컬럼이라 "권한 있고 대상을 골랐는가"를 검사하지 않는다.
 * 그 규칙은 제품 쪽에 있다 — 이걸 화면이 안 막으면 아무것도 올리지 못하는 사람이
 * 시작 정족수를 채우고, 그룹은 시작됐는데 공동 풀은 비어 있는 상태가 된다.
 *
 * ⚠️ 다른 멤버의 칩(`✓ Screen Time`, `✓ 앱 6개`)은 그릴 수 없다. 앱 개수는 서버로
 * 올라가지 않고, 권한 상태는 그 사람이 한 번이라도 올린 뒤에만 알 수 있다.
 * 그래서 칩은 내 줄에만 붙는다.
 */
const ORBIT = 280;

export default function ReadinessScreen() {
  const params = useLocalSearchParams<{ groupId?: string; invite?: string }>();
  /**
   * 13에서 버튼을 눌러 14로 넘어왔는가.
   *
   * 집계 중인 그룹은 이 값 없이도 14를 그린다(13은 시작 전에만 의미가 있다).
   * 그래서 이 값이 참일 때만 뒤로 가기가 13으로 돌아가고, 아니면 화면을 떠난다.
   *
   * `?invite=1`로 들어오면 처음부터 대기실이다. 코드를 보러 온 사람을 준비 상태
   * 화면에 세워 두면 버튼을 한 번 더 눌러야 코드가 나온다.
   */
  const [inWaitingRoom, setInWaitingRoom] = useState(params.invite === '1');

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
    ? 'Screen Time 권한 기다리는 중'
    : tracking.selectionCount === 0
      ? '앱 선택 기다리는 중'
      : null;

  /**
   * 대기실에서 나가는 문.
   *
   * 혼자 만든 그룹은 시작할 수 없다(2명 필요). 남은 것은 친구가 들어오는 일뿐이라
   * 여기 붙잡아 둘 이유가 없다. 디자인의 복구 분기도 시작한 그룹 없이 앱을
   * 둘러볼 수 있어야 한다고 말한다(ONBOARDING_NAVIGATION의 Recovery branch).
   *
   * 예전에는 나가면서 `done`을 찍었다. 되짚기가 그룹을 세던 시절에는 그게 없으면
   * 앱을 켤 때마다 이 대기실로 되돌아왔기 때문이다. 이제 되짚기는 그룹을 보지
   * 않으므로(`resolveRouteForSignedIn`) 그냥 나가면 된다.
   */
  const browse = () => router.replace('/');

  const share = async () => {
    if (!group) return;
    await Share.share({
      message: `${group.name}에 초대할게요. Frimit에서 코드 ${group.invite_code}로 참여해 주세요.`,
    });
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
          /*
            지금 할 수 있는 일이 언제나 primary다.
            
            정족수가 모자라면 시작 버튼은 눌러도 아무 일이 없으므로, 그 자리를
            초대에 내준다. 비활성 버튼을 primary 자리에 세워 두면 "왜 안 눌리지"만
            남고, 정작 해야 할 일(친구 부르기)이 아래로 밀린다. 관리자가 아닌
            사람에게도 같다 — 아직 못 모였을 때 "관리자가 시작하기를 기다리는 중"은
            사실이 아니다. 관리자도 못 누른다.
          */
          <ButtonStack>
            {!isDraft ? (
              <GradientButton label="홈으로 가기" onPress={() => router.replace('/')} />
            ) : canStart ? (
              <>
                {isAdmin ? (
                  <GradientButton
                    label="우리 시간 시작하기"
                    onPress={start}
                    loading={startGroup.isPending}
                  />
                ) : (
                  <AppText variant="bodyStrong" tone="muted" style={styles.waitLine}>
                    관리자가 시작하기를 기다리는 중
                  </AppText>
                )}
                <GradientButton label="초대 보내기" variant="secondary" onPress={share} />
              </>
            ) : (
              <>
                <GradientButton label="초대 보내기" onPress={share} />
                <AppText variant="metadata" tone="faint" style={styles.note}>
                  {READY_MEMBERS_TO_START}명 이상 준비되면 시작할 수 있어요.
                </AppText>
              </>
            )}
            {/*
              둘러보기는 **나갈 방법이 그것뿐일 때만** 그린다.

              하는 일이 "온보딩을 끝난 것으로 표시하고 홈으로"인데, 시작 버튼이
              눈앞에 있는 관리자에게는 그게 두 번째 출구다. 다 모인 화면에서
              할 일은 하나여야 한다.

              시작을 못 누르는 사람에게는 남긴다. 이 표시가 없으면 앱을 다시 켤
              때마다 되짚기가 이 대기실로 돌려보낸다(`resolveRouteForSignedIn`).
            */}
            {isDraft && !(canStart && isAdmin) && (
              <GradientButton label="먼저 둘러보기" variant="tertiary" onPress={browse} />
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
              매일 함께 쓰는 시간
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
            {ready}명 준비 완료 · {total - ready}명 준비 중
          </AppText>
        </View>

        {group && <InviteCodeCard code={group.invite_code} />}
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
            준비를 마쳤으면 다음 자리는 **언제나 대기실**이다.

            예전에는 정족수가 모자랄 때 홈이 primary였다. 초대 코드를 이미
            건넨 뒤였으므로 대기실에는 할 일이 없었기 때문이다. 지금은 초대가
            대기실에 있어서 반대가 됐다 — 혼자 있는 사람에게 가장 중요한 다음
            행동이 그 화면에 있다. 라벨도 그걸 그대로 말한다.

            홈으로 가는 문은 남긴다. 친구가 몇 시간 뒤에 들어오는 것이 실제
            흐름이라, 그 사이를 할 일 없는 화면에서 보내게 하면 안 된다.
          */}
          <GradientButton
            label={me?.is_ready && !blockedReason && !canStart ? '친구 초대하기' : '대기실로 가기'}
            variant={me?.is_ready && !blockedReason ? 'primary' : 'secondary'}
            onPress={() => setInWaitingRoom(true)}
          />

          {me?.is_ready && !blockedReason && !canStart && (
            <GradientButton label="홈으로 가기" variant="tertiary" onPress={browse} />
          )}
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          <BackButton />
          <StepProgress total={4} current={4} />
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
            {total}명 중 {ready}명 준비
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
                    ? ['✓ Screen Time', `✓ 앱 ${tracking.selectionCount}개`]
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
