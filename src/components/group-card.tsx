import { StyleSheet, View, useColorScheme } from 'react-native';

import { Card } from '@/components/card';
import { PoolBar, type PoolSegment } from '@/components/pool-bar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, memberHue } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, formatSyncAge, formatUntilReset, splitDuration } from '@/lib/format';
import type { MyGroup } from '@/lib/groups';
import type { GroupDailyUsage } from '@/lib/usage-sync';

/**
 * 오늘 화면의 그룹 카드.
 *
 * 큰 숫자 자리에는 **잔여시간**이 온다. 사용량이 아니라 잔여를 크게 두는 것은
 * 이 제품이 "얼마나 썼는지 반성하라"가 아니라 "얼마 남았으니 같이 아끼자"는
 * 쪽이기 때문이다. 한도를 넘긴 뒤에는 잔여가 0에서 멈추고 초과분이 따로
 * 오르므로(plan.md 20행) 그때만 큰 숫자가 초과시간으로 바뀐다.
 *
 * 카드는 멤버별 숫자를 적지 않는다. 공동 풀 바에 각자의 구간으로만 들어간다 —
 * 이름과 시간을 나란히 세우면 그게 순위표다.
 */

type GroupCardProps = {
  group: MyGroup;
  usage: GroupDailyUsage | undefined;
  myProfileId: string | undefined;
  onPress?: () => void;
};

export function GroupCard({ group, usage, myProfileId, onPress }: GroupCardProps) {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  if (group.status === 'draft') {
    return <DraftCard group={group} onPress={onPress} />;
  }

  if (!usage) {
    return (
      <Card onPress={onPress}>
        <ThemedText type="metric">{group.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          공동 풀을 읽고 있어요
        </ThemedText>
      </Card>
    );
  }

  const isOver = usage.over_seconds > 0;
  const headline = splitDuration(isOver ? usage.over_seconds : usage.remaining_seconds);

  // 서버는 많이 쓴 사람부터 정렬해서 준다. 그 순서를 그대로 그리면 색만 없는
  // 순위표가 되므로, 사람에 고정된 순서(id)로 다시 세운다.
  const segments: PoolSegment[] = [...usage.members]
    .sort((left, right) => left.profile_id.localeCompare(right.profile_id))
    .map((member) => ({
      id: member.profile_id,
      seconds: member.cumulative_seconds,
      color: member.profile_id === myProfileId ? theme.accent : memberHue(member.profile_id, scheme),
    }));

  const lastCollected = usage.members
    .map((member) => member.last_collected_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const blocked = usage.members.filter(
    (member) => member.permission_state !== null && member.permission_state !== 'granted'
  ).length;

  return (
    <Card onPress={onPress}>
      <View style={styles.titleRow}>
        <ThemedText type="metric" numberOfLines={1} style={styles.title}>
          {group.name}
        </ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          {formatUntilReset(usage.period_end)}
        </ThemedText>
      </View>

      <View style={styles.headlineBlock}>
        <ThemedText type="label" themeColor={isOver ? 'over' : 'textSecondary'}>
          {isOver ? '한도를 넘겼어요' : '남은 시간'}
        </ThemedText>

        <View style={styles.headline}>
          {headline.map((part) => (
            <View key={part.unit} style={styles.headlinePart}>
              <ThemedText type="display" themeColor={isOver ? 'over' : 'text'}>
                {part.value}
              </ThemedText>
              <ThemedText type="metric" themeColor={isOver ? 'over' : 'textSecondary'}>
                {part.unit}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>

      <PoolBar
        segments={segments}
        limitSeconds={usage.daily_limit_seconds}
        overSeconds={usage.over_seconds}
      />

      <View style={styles.metaRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDuration(usage.total_seconds)} 씀 · 한도 {formatDuration(usage.daily_limit_seconds)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {usage.member_count}명
        </ThemedText>
      </View>

      {/*
        가입이 아직 반영되지 않은 사람은 공동 풀에 안 잡힌다(다음 오전 6시부터).
        그 사실을 적어 두지 않으면 "내 시간이 왜 안 세어지지"로만 보인다.
      */}
      {myProfileId && !usage.members.some((member) => member.profile_id === myProfileId) && (
        <ThemedText type="small" themeColor="caution">
          내 사용시간은 다음 오전 6시부터 함께 세요
        </ThemedText>
      )}

      <View style={[styles.syncRow, { borderTopColor: theme.border }]}>
        <ThemedText type="code" themeColor="textSecondary">
          {formatSyncAge(lastCollected)}
        </ThemedText>
        {blocked > 0 && (
          <ThemedText type="code" themeColor="caution">
            동기화 불가 {blocked}명
          </ThemedText>
        )}
      </View>
    </Card>
  );
}

/**
 * 아직 시작하지 않은 그룹.
 *
 * 숫자를 보여주지 않는다. 시작 전에는 아무것도 집계되지 않으므로(서버가 스냅샷을
 * `group_not_collecting`으로 거절한다) 0을 그리면 "오늘 아무도 안 썼다"는 거짓말이 된다.
 * 대신 이 카드가 할 일은 하나다 — 친구를 데려오게 하는 것.
 */
function DraftCard({ group, onPress }: { group: MyGroup; onPress?: () => void }) {
  const theme = useTheme();

  return (
    <Card onPress={onPress}>
      <View style={styles.titleRow}>
        <ThemedText type="metric" numberOfLines={1} style={styles.title}>
          {group.name}
        </ThemedText>
        <View style={[styles.chip, { backgroundColor: theme.accentQuiet }]}>
          <ThemedText type="label" themeColor="accent">
            시작 대기
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        준비된 친구가 2명이 되면 집계를 시작할 수 있어요. 초대 코드를 보내 보세요.
      </ThemedText>

      <View style={[styles.inviteBox, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="label" themeColor="textSecondary">
          초대 코드
        </ThemedText>
        <ThemedText type="metric" style={styles.inviteCode}>
          {group.invite_code}
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  title: { flexShrink: 1 },
  headlineBlock: {
    gap: Spacing.one,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  headlinePart: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  inviteBox: {
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'center',
  },
  inviteCode: {
    letterSpacing: 8,
  },
});
