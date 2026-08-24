import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import {
  BackButton,
  InviteCodeCard,
  OnboardingFrame,
  ReadinessRow,
} from '@/components/onboarding';
import {
  ActionSheet,
  AppText,
  ButtonStack,
  GradientButton,
  StatusDot,
  StatusPill,
} from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import {
  readyCount,
  useGroupMembers,
  useGroupUsages,
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
 * 대기실 — 그룹이 시작되기 전의 유일한 화면.
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
 * 그룹 상세의 "초대 코드 보기"도 여기로 온다. 예전에는 준비 상태 화면이 앞을
 * 막고 있어서 코드를 보려면 버튼을 한 번 더 눌러야 했고, 그걸 건너뛰려고
 * `?invite=1`이라는 파라미터가 따로 있었다. 화면이 하나가 되면서 둘 다 사라졌다.
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
const ORBIT = 220;

export default function WaitingRoomScreen() {
  const params = useLocalSearchParams<{ groupId?: string }>();

  const profile = useMyProfile();
  const groups = useMyGroups();
  const group = useScreenGroup(groups.data, params.groupId);

  const members = useGroupMembers(group?.id);
  // 링이 그리는 큰 숫자가 이 그룹의 실제 한도다. 서버는 시작 전 그룹에도 한도를
  // 정상으로 준다(집계 대상만 0명이다).
  const usages = useGroupUsages(group ? [group] : []);
  const limitSeconds = (group && usages.byGroupId.get(group.id)?.daily_limit_seconds) ?? 28800;

  const tracking = useTrackingState(group?.id);
  const setReady = useSetReady(group?.id);
  const startGroup = useStartGroup();
  const leave = useLeaveGroupPrompt();
  const [menuOpen, setMenuOpen] = useState(false);

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
    그룹이 없으면 아무것도 그리지 않는다.

    그룹을 접으면 목록이 비는데 이 화면은 아직 물러나는 중이라 화면 위에 있다.
    사라지는 그룹의 자리에 빈 대기실을 한 번 그리느니 여기서 조용히 멈춘다.
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

  /*
   * 아직 준비되지 않은 사람만 목록으로 세운다.
   *
   * 준비된 사람은 링의 좌석에 이미 있다. 둘 다 그리면 같은 명단을 두 번 읽는
   * 셈이고, 실제로 그것 때문에 화면이 둘로 갈려 있었다 — 목록이 있는 13과 링이
   * 있는 14. 여기서 알고 싶은 것은 "누구를 기다리는가" 하나다.
   */
  const waiting = (members.data ?? []).filter((member) => !member.is_ready);

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 420, opacity: 0.34, x: 169, y: 240 }}
      footer={
        <ButtonStack>
          {/*
            버튼의 우선순위는 **지금 할 수 있는 일**을 따른다.

            내가 아직 준비 전이면 그것부터다. 준비를 마쳤는데 정족수가 모자라면
            할 일은 초대뿐이고, 다 모였으면 시작이다. 관리자가 아니면 시작 버튼은
            아예 그리지 않는다 — 누를 수 없는 버튼이 primary 자리를 차지하면
            정작 해야 할 일(친구 부르기)이 아래로 밀린다.
          */}
          {isDraft && !me?.is_ready && blockedReason && (
            <GradientButton
              label={isUsable(tracking.permission) ? '앱 고르기' : '권한 켜기'}
              onPress={() =>
                router.push(
                  isUsable(tracking.permission)
                    ? { pathname: '/tracking', params: { groupId: group.id } }
                    : { pathname: '/permission', params: {} }
                )
              }
            />
          )}

          {isDraft && !me?.is_ready && !blockedReason && (
            <GradientButton
              label="준비 완료"
              onPress={() => setReady.mutate(true)}
              loading={setReady.isPending}
            />
          )}

          {!isDraft ? (
            <GradientButton label="홈으로 가기" onPress={browse} />
          ) : (
            <>
              {canStart && isAdmin && (
                <GradientButton
                  label="시작하기"
                  onPress={start}
                  loading={startGroup.isPending}
                />
              )}
              {canStart && !isAdmin && (
                <AppText variant="bodyStrong" tone="muted" style={styles.waitLine}>
                  관리자가 시작하기를 기다리는 중
                </AppText>
              )}

              <GradientButton
                label="초대 보내기"
                variant={canStart || !me?.is_ready ? 'secondary' : 'primary'}
                onPress={share}
              />

              {!canStart && (
                <AppText variant="metadata" tone="faint" style={styles.note}>
                  {READY_MEMBERS_TO_START}명 이상 준비되면 시작할 수 있어요.
                </AppText>
              )}

              {/* 친구는 몇 시간 뒤에 들어온다. 그 사이를 할 일 없는 화면에서
                  보내게 하지 않는다. 시작을 누를 수 있는 사람에게는 그리지
                  않는다 — 다 모인 화면에서 할 일은 하나여야 한다. */}
              {!(canStart && isAdmin) && (
                <GradientButton label="홈으로 가기" variant="tertiary" onPress={browse} />
              )}
            </>
          )}
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          <BackButton />
          <StatusPill label={group.name} dotColor={colors.accent.violetSoft} />
          <MoreButton disabled={leave.isPending} onPress={() => setMenuOpen(true)} />
        </View>

        <AppText variant="greeting" style={styles.center}>
          {!isDraft ? '곧 시작해요' : canStart ? '다 모였어요' : '친구를 기다리는 중'}
        </AppText>
      </View>

      <View style={styles.orbitBox}>
        <SharedOrbitRing
          size={ORBIT}
          progress={total > 0 ? ready / total : 0}
          gradient={gradients.sharedPool.colors}
          showTrackDashes
          strokeRatio={0.12}>
          <AppText variant="heroNumberMd">{formatShort(limitSeconds)}</AppText>
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

      <View style={styles.bottom}>
        <View style={styles.status}>
          <StatusDot color={colors.accent.cyan} />
          <AppText variant="bodyStrong" tone="muted">
            {ready}명 준비 완료 · {total - ready}명 준비 중
          </AppText>
        </View>

        {/* 기다리는 사람들. 내 줄에는 무엇이 막고 있는지도 적는다 — 남의 권한
            상태와 앱 개수는 서버로 올라오지도 않는다. */}
        {waiting.length > 0 && (
          <View style={styles.rows}>
            {waiting.map((member) => {
              const self = member.profile_id === profile.data?.id;

              return (
                <ReadinessRow
                  key={member.profile_id}
                  id={member.profile_id}
                  name={`${member.nickname}${self ? ' (나)' : ''}`}
                  emoji={avatarEmoji(member.avatar_key)}
                  state="pending"
                  pendingReason={self ? (blockedReason ?? '준비 대기') : '준비 대기'}
                />
              );
            })}
          </View>
        )}

        <InviteCodeCard code={group.invite_code} />
      </View>

      <ActionSheet
        visible={menuOpen}
        title={group.name}
        onClose={() => setMenuOpen(false)}
        actions={[
          // 시작한 그룹의 한도는 전원 동의가 필요하다. 그건 그룹 상세가 맡는다.
          ...(isDraft && isAdmin
            ? [
                {
                  label: '공동 시간 바꾸기',
                  onPress: () =>
                    router.push({ pathname: '/group/limit' as const, params: { groupId: group.id } }),
                },
              ]
            : []),
          {
            label: '그룹 나가기',
            danger: true,
            onPress: () => leave.prompt(group, members.data, profile.data?.id),
          },
        ]}
      />

      {leave.sheet}
    </OnboardingFrame>
  );
}

/**
 * 그룹 설정 메뉴.
 *
 * 한동안 `···`이었다가 [나가기]가 됐다가 다시 `···`이다. 이유가 그때마다 있었다 —
 * 하는 일이 나가기 하나뿐인 동안에는 `···`이 거짓말이었고, 공동 시간 바꾸기가
 * 들어오면서 진짜 메뉴가 됐다.
 *
 * 시작 전 그룹은 상세 화면으로 갈 수 없어서(오늘 화면의 카드가 여기로 온다)
 * 나가는 문이 여기 없으면 만들어 본 그룹을 정리할 방법이 없다.
 *
 * 항목이 셋을 넘으면 `Alert`을 버려야 한다. Android는 버튼 셋까지만 받고
 * 넷째부터는 조용히 사라진다.
 */
function MoreButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="그룹 설정"
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
  // 프레임이 위·가운데·아래 셋으로 나누는 리듬을 쓴다. 링이 가운데를 잡고,
  // 기다리는 사람과 초대 코드가 아래 덩어리다.
  bottom: { gap: 10 },
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
  center: { textAlign: 'center' },
  rows: { gap: 10, paddingTop: 6 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  waitLine: { textAlign: 'center', paddingVertical: 14 },
  note: { textAlign: 'center' },
});
