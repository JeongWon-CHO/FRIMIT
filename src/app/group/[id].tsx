import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import {
  AppText,
  Avatar,
  Bloom,
  EmptyState,
  GradientButton,
  ProgressBar,
  ScreenFrame,
  StatusDot,
  StatusPill,
  Surface,
} from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';
import { useGroupMembers, useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useTrackingState } from '@/hooks/use-tracking';
import { hexToRgba } from '@/lib/color';
import { formatShort } from '@/lib/format';
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
  const group = groups.data?.find((candidate) => candidate.id === id);
  const usages = useGroupUsages(group ? [group] : []);
  const members = useGroupMembers(id);
  const tracking = useTrackingState(id);

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
    <ScreenFrame bottomInset={24} texture={visual.texture}>
      <View style={styles.navBar}>
        <CircleButton label="←" onPress={() => router.back()} />
        <StatusPill label={group?.name ?? '…'} dotColor={accent.dot} />
        {/* 그룹 설정은 아직 갈 곳이 없다. 자리만 지켜 두고 비활성으로 남긴다. */}
        <CircleButton label="···" disabled />
      </View>

      {!view ? (
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
                    USED
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
                  Left together
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
                    {view.ranking.length} members sharing
                  </AppText>
                </View>
              </View>
            </View>
          </Surface>

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
                  onPress={() => router.push({ pathname: '/ready', params: { groupId: id } })}
                />
              }
            />
          ) : (
            <>
              {rankOne && <RankOneCard member={rankOne} />}
              <View style={styles.rankList}>
                {rest.map((member, index) => (
                  <RankingItem key={member.id} rank={index + 2} member={member} />
                ))}
              </View>
            </>
          )}

          <MyShareCard view={view} myId={profile.data?.id} />
        </>
      )}
    </ScreenFrame>
  );
}

/**
 * 1등 — 오늘 가장 적게 쓴 사람.
 *
 * 화면에서 발광하는 멤버는 이 한 명뿐이다. 왕관·라벨·링 셋이 함께 나오고,
 * 꼴찌에게는 어떤 표시도 붙지 않는다.
 */
function RankOneCard({ member }: { member: RankedMember }) {
  return (
    <Surface
      fill={['#161029', '#0B0B12']}
      border={colors.border.violet}
      cornerRadius={24}
      padding={14}
      style={styles.memberCard}>
      <View style={styles.crownBox}>
        <Avatar
          id={member.id}
          name={member.name}
          emoji={member.emoji}
          size="lg"
          ring="achievement"
          borderColor="#12101F"
        />
        <AppText variant="cardTitle" style={styles.crown}>
          👑
        </AppText>
      </View>

      <View style={styles.memberText}>
        <AppText variant="cardTitle">
          {member.name}
          {member.isMe ? ' (나)' : ''}
        </AppText>
        <SyncLine member={member} />
      </View>

      <View style={styles.memberRight}>
        <AppText variant="cardNumber">{member.usageLabel}</AppText>
        <AppText variant="badge" tone="achievement" font="display">
          LEAST TODAY
        </AppText>
      </View>
    </Surface>
  );
}

/** 2등 이하. 전부 같은 중립 표면이다 — 색으로 등수를 매기지 않는다. */
function RankingItem({ rank, member }: { rank: number; member: RankedMember }) {
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
    </View>
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
          MY SHARE
        </AppText>
        <AppText variant="bodyStrong" tone="body">
          {formatShort(Math.max(0, share - used))} left
        </AppText>
      </View>

      <ProgressBar
        progress={share > 0 ? used / share : 0}
        height={5}
        gradient={gradients.violetToBlue.colors}
      />

      <View style={styles.myShareTop}>
        <AppText variant="metadata" tone="muted">
          Used {formatShort(used)}
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
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
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
  crownBox: { position: 'relative' },
  crown: { position: 'absolute', top: -8, right: -6 },
  memberText: { flex: 1, gap: 2 },
  memberRight: { alignItems: 'flex-end', gap: 3 },
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
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  myShare: { gap: 9, marginTop: 2 },
  myShareTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
