import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { RecentDays } from '@/components/recent-days';
import {
  AppText,
  Avatar,
  Bloom,
  ButtonStack,
  EmptyState,
  GradientButton,
  ProgressBar,
  ActionSheet,
  ScreenFrame,
  StatusDot,
  StatusPill,
  Surface,
} from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';
import { useGroupMembers, useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { useCurrentProposal, useRespondToProposal, useWithdrawProposal } from '@/hooks/use-rules';
import { useLeaveGroupPrompt } from '@/hooks/use-leave-group-prompt';
import { useRecentDays } from '@/hooks/use-history';
import { useNudge } from '@/hooks/use-nudge';
import { useUsageSync } from '@/hooks/use-usage-sync';
import { useMyProfile } from '@/hooks/use-profile';
import { useScreenGroup } from '@/hooks/use-screen-group';
import { useTrackingState } from '@/hooks/use-tracking';
import { hexToRgba } from '@/lib/color';
import { formatClock, formatRemaining, formatShort, isFuture } from '@/lib/format';
import { POOL_VISUALS } from '@/lib/pool-state';
import { isUsable } from '@/lib/tracking';
import { buildPoolView, type RankedMember } from '@/lib/today';

/**
 * 그룹 상세 — 한 그룹의 오늘 전부.
 *
 * 읽는 순서가 정해져 있다: **우리 남은 시간 → 멤버 순위 → 내 몫**. 개인 값이
 * 공동 풀보다 커 보이면 이 화면은 실패한 것이다.
 *
 * 순위는 **덜 쓴 순서**다. 1등에게만 보상이 붙고 꼴찌에게는 아무 표시도 없다 —
 * 이 제품은 적게 쓴 것을 칭찬하지 많이 쓴 것을 벌하지 않는다.
 */
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const profile = useMyProfile();
  const groups = useMyGroups();
  const group = useScreenGroup(groups.data, id);
  const usages = useGroupUsages(group ? [group] : []);
  const members = useGroupMembers(id);
  const history = useRecentDays(id);
  const tracking = useTrackingState(id);
  const leave = useLeaveGroupPrompt();
  const nudge = useNudge();

  const [menuOpen, setMenuOpen] = useState(false);

  /*
   * 찌른 사람들 — 값은 **다시 찌를 수 있는 시각**이다.
   *
   * 서버가 성공 응답에 `next_allowed_at`을 담아 준다. 그걸 그대로 들고 있으면
   * 쿨다운을 여기서 다시 셀 필요가 없다(30분이라는 숫자가 화면에 박히지 않는다).
   *
   * 째깍거리지 않는다. 30분짜리 타이머를 멤버 수만큼 돌릴 값이 아니고, 다시
   * 그려지는 순간(당겨서 새로고침, 화면 재진입) 저절로 맞는다.
   */
  const [poked, setPoked] = useState<Record<string, string>>({});

  /*
   * 당겨서 새로고침.
   *
   * 오늘 화면과 같은 순서다 — **먼저 올리고 그다음 읽는다**(`useUsageSync`).
   * 반대로 하면 내가 방금 쓴 시간만 빠진 순위가 그려진다. 동기화가 끝나면 훅이
   * `['groups', …]` 접두사를 통째로 비우므로 멤버·집계·최근 7일이 함께 새로 온다.
   */
  const sync = useUsageSync();

  /**
   * 콕 찌르기.
   *
   * 성공해도 조용하다 — 찌른 사람에게 필요한 확인은 활동 내역에 줄이 하나 생기는
   * 것으로 충분하고, 매번 뜨는 확인창은 장난스러운 동작을 무겁게 만든다.
   * 거절만 말한다(쿨다운, 하루 10회). 서버 문구가 이미 사용자에게 하는 말이다.
   */
  const poke = (memberId: string) => {
    if (!group) return;

    /*
     * 손끝의 '콕'. 성공을 기다리지 않고 누른 순간에 친다 — 이건 결과 통보가
     * 아니라 눌렸다는 대답이라서, 왕복 뒤에 오면 이미 늦다.
     *
     * 저전력 모드나 탭틱 엔진을 끈 기기에서는 조용히 아무 일도 없다. 그래서
     * 이것 말고 화면 쪽 표시(버튼이 '29분 남음'으로 바뀌는 것)가 따로 있다.
     */
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    nudge
      .mutateAsync({ groupId: group.id, profileId: memberId })
      .then((result) =>
        setPoked((current) => ({ ...current, [memberId]: result.next_allowed_at }))
      )
      .catch((error: unknown) =>
        Alert.alert('지금은 못 찔러요', error instanceof Error ? error.message : String(error))
      );
  };

  const view = useMemo(
    () =>
      group
        ? buildPoolView(group, usages.byGroupId.get(group.id), members.data, {
            permission: isUsable(tracking.permission),
            myProfileId: profile.data?.id,
          })
        : null,
    [group, usages.byGroupId, members.data, tracking.permission, profile.data?.id]
  );

  const visual = view ? POOL_VISUALS[view.state] : POOL_VISUALS.normal;
  const accent = view ? colors.groupAccent[view.accent] : colors.groupAccent.violet;
  const [rankOne, ...rest] = view?.ranking ?? [];

  return (
    <ScreenFrame bottomInset={24} texture={visual.texture} onRefresh={sync.sync}>
      <View style={styles.navBar}>
        <CircleButton label="←" onPress={() => router.back()} />
        <StatusPill label={group?.name ?? '…'} dotColor={accent.dot} />
        {/*
          이 그룹에 대해 할 수 있는 일이 둘(공동 시간 바꾸기·나가기)인데 하나는
          본문 한가운데 줄로, 하나는 여기 버튼으로 흩어져 있었다. 한 자리로 모은다.
        */}
        <CircleButton
          label="⚙"
          accessibilityLabel="그룹 설정"
          disabled={!group || leave.isPending}
          onPress={() => setMenuOpen(true)}
        />
      </View>

      {/*
        그룹이 사라지는 중이면(접고 물러나는 길) 아무것도 그리지 않는다.
        아직 읽는 중일 때만 그렇게 말한다.
      */}
      {!group ? null : !view ? (
        <EmptyState title="읽는 중이에요" body="공동 풀 상태를 불러오고 있어요." />
      ) : (
        <>
          <Surface
            fill={gradients.heroSurface.colors}
            gradientLocations={gradients.heroSurface.stops}
            cornerRadius={radii.heroCard}
            padding={18}
            texture="heroCard"
            border={colors.border.hairlineStrong}
            bloom={
              <Bloom color={accent.bloom} size={300} opacity={0.5} x={90} y={0} />
            }>
            <View style={styles.heroRow}>
              <View>
                <SharedOrbitRing
                  size={122}
                  progress={view.progress}
                  variant={view.overSeconds > 0 ? 'overshoot' : 'segmented'}
                  gradient={visual.arc}
                  segmentValues={view.ranking.map((member) => member.seconds)}
                  segmentLimit={view.limitSeconds}
                  gapColor="#12121F"
                  overSeconds={view.overSeconds}
                  limitSeconds={view.limitSeconds}
                  strokeRatio={0.26}>
                  <AppText variant="cardNumber">{formatShort(view.usedSeconds)}</AppText>
                  <AppText variant="numericLabel" tone="metadata">
                    사용
                  </AppText>
                </SharedOrbitRing>

                <OrbitSeats
                  seats={view.seats}
                  size={122}
                  variant="detail"
                  strokeRatio={0.26}
                  surfaceColor="#12121F"
                />
              </View>

              <View style={styles.heroText}>
                <AppText variant="bodyStrong" tone="muted">
                  함께 남은 시간
                </AppText>
                <AppText variant="heroNumberMd" tone={visual.numberTone}>
                  {view.headline}
                </AppText>
                <AppText variant="bodyStrong" tone="muted">
                  {view.sublabel}
                </AppText>
                <View style={styles.heroBar}>
                  <ProgressBar progress={view.progress} height={6} gradient={visual.arc} />
                  <AppText variant="badge" tone="metadata" font="display">
                    {view.ranking.length}명이 함께 써요
                  </AppText>
                </View>
              </View>
            </View>
          </Surface>

          <RuleSlot
            groupId={id}
            isAdmin={group.admin_id === profile.data?.id}
            myProfileId={profile.data?.id}
            limitSeconds={view.limitSeconds}
          />

          <View style={styles.sectionTitle}>
            <AppText variant="sectionTitle">Today&apos;s ranking</AppText>
            <AppText variant="metadata" tone="metadata">
              덜 쓴 순서
            </AppText>
          </View>

          {view.ranking.length <= 1 ? (
            <EmptyState
              title="친구를 초대하면 순위가 시작돼요"
              body="공동 시간은 친구가 있어야 흘러요."
              action={
                <GradientButton
                  label="초대 코드 보기"
                  size="md"
                  onPress={() =>
                    router.push({ pathname: '/ready', params: { groupId: id } })
                  }
                />
              }
            />
          ) : (
            <>
              {rankOne && (
                <RankOneCard
                  member={rankOne}
                  nextNudgeAt={poked[rankOne.id]}
                  onNudge={() => poke(rankOne.id)}
                />
              )}
              <View style={styles.rankList}>
                {rest.map((member, index) => (
                  <RankingItem
                    key={member.id}
                    rank={index + 2}
                    member={member}
                    nextNudgeAt={poked[member.id]}
                    onNudge={() => poke(member.id)}
                  />
                ))}
              </View>
            </>
          )}

          <MyShareCard view={view} myId={profile.data?.id} />

          <RecentDays days={history.data} />
        </>
      )}

      <ActionSheet
        visible={menuOpen}
        title={group?.name}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: `공동 시간 바꾸기${view ? ` · 지금 ${formatShort(view.limitSeconds)}` : ''}`,
            onPress: () => router.push({ pathname: '/group/limit', params: { groupId: id } }),
          },
          {
            label: '그룹 나가기',
            danger: true,
            onPress: () => group && leave.prompt(group, members.data, profile.data?.id),
          },
        ]}
      />

      {leave.sheet}
    </ScreenFrame>
  );
}

/**
 * 공동 시간 한 줄 — 그리고 변경안이 도는 동안의 그 자리.
 *
 * 자리를 하나만 쓴다. 평소에는 "지금 8h · 바꾸기"이고, 변경안이 도는 동안에는
 * 같은 자리가 "8h → 6h, 1명 남음"이 된다. 둘을 따로 두면 변경안이 진행 중인데
 * 그 옆에서 또 바꾸자고 할 수 있는 것처럼 보인다 — 서버는 그룹당 하나만 받는다.
 *
 * 조회가 만료 판정을 겸한다(`current_rule_proposal`은 volatile이다). 그래서 이
 * 화면을 여는 것만으로 48시간이 지난 변경안이 정리된다.
 */
function RuleSlot({
  groupId,
  isAdmin,
  myProfileId,
  limitSeconds,
}: {
  groupId: string;
  isAdmin: boolean;
  myProfileId?: string;
  limitSeconds: number;
}) {
  const current = useCurrentProposal(groupId);
  const respond = useRespondToProposal();
  const withdraw = useWithdrawProposal();

  const snapshot = current.data;
  const proposal = snapshot?.proposal;
  const pending = proposal?.status === 'pending';

  const scheduled =
    proposal?.status === 'approved' &&
    proposal.effective_from !== null &&
    isFuture(proposal.effective_from);

  const fail = (error: unknown) =>
    Alert.alert('처리하지 못했어요', error instanceof Error ? error.message : String(error));

  if (scheduled && proposal) {
    return (
      <Surface
        fill={colors.surface.cardNeutral}
        cornerRadius={22}
        padding={16}
        style={styles.ruleCard}>
        <AppText variant="eyebrow" tone="cyan">
          바뀔 예정
        </AppText>
        <AppText variant="bodyStrong">
          {formatClock(proposal.effective_from as string, proposal.time_zone)}부터 공동 시간이{' '}
          {formatShort(proposal.daily_limit_seconds)}예요
        </AppText>
        <AppText variant="metadata" tone="metadata">
          오늘은 지금 규칙 그대로 흘러요.
        </AppText>
      </Surface>
    );
  }

  if (pending && proposal) {
    const mine = proposal.proposer_id === myProfileId;
    const waiting = snapshot.pending_count;
    const answered = snapshot.my_decision !== 'pending' && snapshot.my_decision !== null;

    return (
      <Surface
        fill={colors.surface.cardNeutral}
        border={hexToRgba(colors.accent.violetSoft, 0.24)}
        cornerRadius={22}
        padding={16}
        style={styles.ruleCard}>
        <AppText variant="eyebrow" tone="faint">
          공동 시간 변경안
        </AppText>

        <View style={styles.ruleChange}>
          <AppText variant="cardNumber" tone="muted">
            {formatShort(snapshot.base_rule?.daily_limit_seconds ?? limitSeconds)}
          </AppText>
          <AppText variant="cardNumber" tone="muted">
            →
          </AppText>
          <AppText variant="cardNumber">{formatShort(proposal.daily_limit_seconds)}</AppText>
        </View>

        <AppText variant="metadata" tone="metadata">
          {waiting > 0
            ? `${waiting}명이 아직 답하지 않았어요 · ${formatRemaining(proposal.expires_at)}`
            : '모두 답했어요'}
        </AppText>

        {/* 한 번 답하면 바꿀 수 없다(서버 규칙). 그래서 답한 사람에게는 버튼을
            그리지 않고 무엇을 골랐는지만 남긴다. */}
        {answered ? (
          <AppText variant="metadata" tone={snapshot.my_decision === 'approved' ? 'cyan' : 'over'}>
            {snapshot.my_decision === 'approved' ? '동의했어요' : '거절했어요'}
          </AppText>
        ) : (
          <ButtonStack>
            <GradientButton
              label="동의"
              size="md"
              loading={respond.isPending}
              onPress={() =>
                respond
                  .mutateAsync({ proposalId: proposal.id, approve: true })
                  .catch(fail)
              }
            />
            <GradientButton
              label="거절"
              variant="secondary"
              size="md"
              onPress={() =>
                respond
                  .mutateAsync({ proposalId: proposal.id, approve: false })
                  .catch(fail)
              }
            />
          </ButtonStack>
        )}

        {/* 제안자가 사라지면 48시간 동안 아무도 새 변경안을 낼 수 없다. 그래서
            관리자에게도 거두는 문을 준다(서버도 그 둘만 받는다). */}
        {(mine || isAdmin) && (
          <GradientButton
            label="변경안 거두기"
            variant="tertiary"
            size="md"
            loading={withdraw.isPending}
            onPress={() =>
              withdraw.mutateAsync({ proposalId: proposal.id }).catch(fail)
            }
          />
        )}
      </Surface>
    );
  }

  /*
   * 평소에는 아무것도 그리지 않는다 — 바꾸는 문은 오른쪽 위 설정으로 옮겼다.
   * 지금 한도는 히어로가 이미 "우리 시간 8h 중"으로 말하고 있다.
   *
   * 변경안이 도는 동안만 위의 카드가 이 자리를 차지한다. 그건 읽고 답해야 하는
   * 것이라 메뉴 안에 숨기면 안 된다.
   */
  return null;
}

/**
 * 1등 — 오늘 가장 적게 쓴 사람.
 *
 * 등수는 아래 행들과 **같은 숫자로** 센다. 1을 빼고 왕관 같은 것으로 대신하면
 * 목록이 2부터 시작해서 셈이 끊긴다. 자리와 폭도 행과 같아 아바타가 세로로 맞는다.
 *
 * 표면은 보라 그라데이션이고, 성취를 말하는 것들(테두리·링·배지)은 금색이다.
 * 왕관만 걷어냈다 — 배지가 이미 하는 말이라 다섯 번째 신호였다.
 *
 * ⚠️ 이 카드는 강조색 둘을 함께 쓴다. 보라는 이 화면에서 **그룹 정체색**이기도
 * 해서(`groupAccent`), 시안·분홍 그룹에 들어가면 1등 카드만 혼자 보라로 뜬다.
 * 색을 하나로 모으려면 표면을 중립(`surface.elevated`)으로 두면 되고, 그때 금색
 * 셋만 남는다. 지금은 보라 표면을 쓰기로 한 선택이다.
 *
 * 꼴찌에게는 여전히 아무 표시도 붙지 않는다.
 */
function RankOneCard({
  member,
  nextNudgeAt,
  onNudge,
}: {
  member: RankedMember;
  nextNudgeAt?: string;
  onNudge: () => void;
}) {
  return (
    <Surface
      fill={['#161029', '#0B0B12']}
      border={hexToRgba(colors.state.achievement, 0.27)}
      cornerRadius={24}
      padding={14}
      style={styles.memberCard}>
      <AppText variant="numericLabel" tone="muted" style={styles.rankNumeral}>
        1
      </AppText>

      <Avatar
        id={member.id}
        name={member.name}
        emoji={member.emoji}
        size="lg"
        ring="achievement"
        borderColor="#12101F"
      />

      <View style={styles.memberText}>
        <AppText variant="cardTitle">
          {member.name}
          {member.isMe ? ' (나)' : ''}
        </AppText>
        <SyncLine member={member} />
      </View>

      <AppText variant="cardNumber">{member.usageLabel}</AppText>

      <NudgeButton member={member} nextNudgeAt={nextNudgeAt} onPress={onNudge} />
    </Surface>
  );
}

/** 2등 이하. 전부 같은 중립 표면이다 — 색으로 등수를 매기지 않는다. */
function RankingItem({
  rank,
  member,
  nextNudgeAt,
  onNudge,
}: {
  rank: number;
  member: RankedMember;
  nextNudgeAt?: string;
  onNudge: () => void;
}) {
  return (
    <View style={styles.rankRow}>
      <AppText variant="numericLabel" tone="muted" style={styles.rankNumeral}>
        {rank}
      </AppText>

      <Avatar
        id={member.id}
        name={member.name}
        emoji={member.emoji}
        size="sm"
        borderColor="#0B0B10"
      />

      <View style={styles.memberText}>
        <AppText variant="bodyStrong">
          {member.name}
          {member.isMe ? ' (나)' : ''}
        </AppText>
        <SyncLine member={member} />
      </View>

      <AppText variant="memberNumber">{member.usageLabel}</AppText>

      <NudgeButton member={member} nextNudgeAt={nextNudgeAt} onPress={onNudge} />
    </View>
  );
}

/**
 * 콕 찌르기 단추.
 *
 * 나에게는 나타나지 않는다. 자리를 비워 두지도 않는다 — 내 줄에만 빈 칸이 생기면
 * 그게 더 눈에 띈다.
 *
 * 예전에는 눈(👀) 하나였다. "보고 있어"라는 뜻이었는데 그 뜻이 아이콘만으로는
 * 전해지지 않았다 — 누르기 전에는 무엇이 일어날지, 누른 뒤에는 일어났는지
 * 알 수 없었다. 이름을 쓰고, 찌른 뒤에는 그 자리에서 그렇게 말한다.
 *
 * 방금 찌른 사람에게는 **언제 다시 찌를 수 있는지**를 쓴다. 잠긴 버튼이 이유를
 * 말하지 않으면 고장으로 읽히고, 그때 사용자가 하는 일은 계속 눌러 보는 것이다.
 * 남은 시간은 서버가 준 시각에서 나온다 — 30분이라는 숫자를 화면이 알 필요는 없다.
 */
function NudgeButton({
  member,
  nextNudgeAt,
  onPress,
}: {
  member: RankedMember;
  nextNudgeAt?: string;
  onPress: () => void;
}) {
  if (member.isMe) return null;

  // 변경안 카드와 같은 서식을 쓴다 — 한 화면에서 남은 시간을 두 가지로 쓰지 않는다.
  const waiting = nextNudgeAt && isFuture(nextNudgeAt) ? formatRemaining(nextNudgeAt) : null;
  const label = waiting ?? '콕 찌르기';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        waiting ? `${member.name} 콕 찌르기, ${waiting} 다시 가능` : `${member.name} 콕 찌르기`
      }
      disabled={!!waiting}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.nudge,
        waiting && styles.nudgeDone,
        pressed && { opacity: 0.5 },
      ]}>
      <AppText variant="metadata" tone={waiting ? 'metadata' : 'body'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SyncLine({ member }: { member: RankedMember }) {
  if (!member.stale) {
    return (
      <AppText variant="metadata" tone="metadata">
        {member.syncLabel}
      </AppText>
    );
  }

  return (
    <View style={styles.syncLine}>
      <StatusDot color={colors.state.staleSync} size={5} />
      <AppText variant="metadata" tone="stale">
        {member.syncLabel}
      </AppText>
    </View>
  );
}

/**
 * 내 몫.
 *
 * 디자인의 자리는 "내 개인 한도"인데 **서버에 개인 한도가 없다** — `group_rules`가
 * 가진 것은 그룹 공동 한도뿐이다. 없는 값을 지어내는 대신 있는 값 둘로 같은
 * 질문에 답한다: 내가 오늘 얼마나 썼고, 인원수로 나눈 몫은 얼마인가.
 *
 * 히어로보다 조용해야 한다. 블룸도 그림자도 없다.
 */
function MyShareCard({
  view,
  myId,
}: {
  view: NonNullable<ReturnType<typeof buildPoolView>>;
  myId?: string;
}) {
  const me = view.ranking.find((member) => member.id === myId);
  const share = view.ranking.length > 0 ? view.limitSeconds / view.ranking.length : 0;
  const used = me?.seconds ?? 0;

  return (
    <Surface
      fill={hexToRgba('#FFFFFF', 0.03)}
      border={colors.border.subtle}
      cornerRadius={22}
      padding={14}
      style={styles.myShare}>
      <View style={styles.myShareTop}>
        <AppText variant="eyebrow" tone="faint">
          내 몫
        </AppText>
        <AppText variant="bodyStrong" tone="body">
          {formatShort(Math.max(0, share - used))} 남음
        </AppText>
      </View>

      <ProgressBar
        progress={share > 0 ? used / share : 0}
        height={5}
        gradient={gradients.violetToBlue.colors}
      />

      <View style={styles.myShareTop}>
        <AppText variant="metadata" tone="muted">
          {formatShort(used)} 사용
        </AppText>
        <AppText variant="metadata" tone="metadata">
          {view.ranking.length}명 기준 · 1인 {formatShort(share)}
        </AppText>
      </View>
    </Surface>
  );
}

function CircleButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[styles.circle, disabled && styles.circleDim]}>
      <AppText variant="bodyStrong" tone="body">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ruleCard: { gap: 10 },
  ruleChange: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  circleDim: { opacity: 0.34 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroText: { flex: 1, gap: 4 },
  heroBar: { gap: 6, paddingTop: 4 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  memberText: { flex: 1, gap: 2 },
  rankList: { gap: 7 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.listRow,
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: colors.surface.row,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  rankNumeral: { width: 22 },
  nudge: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    marginLeft: 8,
  },
  // 기다리는 동안에는 표면을 지운다 — 지금 누를 자리로 보이면 안 된다.
  nudgeDone: { backgroundColor: 'transparent', borderColor: colors.border.subtle },
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  myShare: { gap: 9, marginTop: 2 },
  myShareTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
