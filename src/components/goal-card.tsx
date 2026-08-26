import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Bloom, ProgressBar, StatusPill, Surface } from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';
import type { GoalView } from '@/lib/goal-view';

/**
 * 공동 목표 한 장.
 *
 * 이 화면에서 가장 큰 글씨는 **그룹 퍼센트**다(MASTER_QA_CHECKLIST). 목표 이름도
 * 멤버 이름도 그보다 커지면 안 된다 — 여기서 읽어야 하는 것은 "우리가 어디까지
 * 왔는가"이고 나머지는 그 근거다.
 *
 * 멤버 막대에는 후광이 없다. 히어로의 12px 바만 팁 점을 갖는다.
 */
type GoalCardProps = {
  view: GoalView;
  onPress?: () => void;
  /** 히어로 아래에 붙는 기록 입력줄. 히어로에만 온다. */
  footer?: React.ReactNode;
  /** 지금 위에 떠 있는 목표. 테두리로 위 카드와 이 카드를 잇는다(그리드 전용). */
  selected?: boolean;
};

export const GoalHeroCard = memo(function GoalHeroCard({ view, footer }: GoalCardProps) {
  const accent = colors.groupAccent[view.accent];

  return (
    <Surface
      fill={['#121223', '#0A0A11']}
      gradientLocations={[0, 0.6]}
      cornerRadius={radii.heroCard}
      padding={22}
      texture="heroCard"
      border={colors.border.hairlineStrong}
      bloom={<Bloom color={hexToRgba(colors.accent.indigo, 0.5)} size={300} opacity={0.5} x={20} y={0} />}>
      <View style={styles.pillRow}>
        <StatusPill label={view.groupName} dotColor={accent.dot} size="sm" />
        <AppText variant="metadata" style={{ color: colors.accent.bluePale }}>
          {view.deadlineLabel}
        </AppText>
      </View>

      <AppText variant="greeting" style={styles.title}>
        {view.title}
      </AppText>

      <View style={styles.percentRow}>
        <AppText variant="heroNumber">{view.percentLabel}</AppText>
        <AppText variant="metadata" tone="muted" style={styles.percentCaption}>
          {/* 평균이라는 사실을 숨기지 않는다. 한 사람이 다 해도 100%가 되지 않는다. */}
          우리 평균 · 1인 {view.targetAmount}
          {view.unit}
        </AppText>
      </View>

      <View style={styles.heroBar}>
        <ProgressBar progress={view.progress} height={12} gradient={gradients.sharedPool.colors} tip />
      </View>

      <View style={styles.divider} />

      <View style={styles.members}>
        {view.members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <Avatar id={member.id} name={member.name} emoji={member.emoji} size="xs" borderColor="#0F0F1A" />
            <View style={styles.memberText}>
              <View style={styles.memberLabel}>
                <AppText variant="bodyStrong">{member.isMe ? '나' : member.name}</AppText>
                <AppText variant="metadata" tone="metadata">
                  {member.countLabel}
                </AppText>
              </View>
              <ProgressBar
                progress={member.ratio}
                height={5}
                gradient={gradients.violetToBlue.colors}
              />
            </View>
          </View>
        ))}
      </View>

      {footer}
    </Surface>
  );
});

/**
 * 그리드의 작은 목표 카드.
 *
 * 미니 링을 쓰지 않는다 — 목록 안의 SVG는 그룹이 늘수록 스크롤을 무너뜨린다
 * (RN_IMPLEMENTATION_NOTES). 퍼센트 숫자와 5px 막대면 같은 것을 말한다.
 */
export const GoalTile = memo(function GoalTile({ view, onPress, selected }: GoalCardProps) {
  const accent = colors.groupAccent[view.accent];

  return (
    <Surface
      fill={accent.surface}
      border={selected ? colors.border[view.accent] : undefined}
      cornerRadius={radii.groupCard}
      padding={16}
      onPress={onPress}
      style={styles.tile}
      bloom={<Bloom color={accent.bloom} size={200} opacity={0.4} x={120} y={100} />}>
      <View style={styles.tileTop}>
        <AppText variant="cardNumber">{view.percentLabel}</AppText>
        <AppText variant="metadata" tone="metadata">
          {view.deadlineLabel}
        </AppText>
      </View>

      <ProgressBar progress={view.progress} height={5} gradient={gradients.blueToCyan.colors} />

      <View style={styles.tileText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {view.title}
        </AppText>
        <AppText variant="metadata" tone="muted" numberOfLines={1}>
          {view.groupName}
        </AppText>
      </View>
    </Surface>
  );
});

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { marginTop: 18 },
  percentRow: { marginTop: 10, gap: 4 },
  percentCaption: { letterSpacing: 0 },
  heroBar: { marginTop: 18 },
  divider: {
    height: 1,
    backgroundColor: colors.border.hairline,
    marginTop: 22,
    marginBottom: 18,
  },
  members: { gap: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberText: { flex: 1, gap: 6 },
  memberLabel: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  tile: { height: 142, justifyContent: 'space-between' },
  tileTop: { gap: 2 },
  tileText: { gap: 3 },
});
