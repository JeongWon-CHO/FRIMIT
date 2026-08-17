import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { GroupCard } from '@/components/group-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useUsageSync } from '@/hooks/use-usage-sync';
import { formatDateKey } from '@/lib/format';
import { DEFAULT_TIME_ZONE, frimitDateKey } from '@/lib/frimit-day';

/**
 * 오늘 화면.
 *
 * 모든 그룹의 공동 풀을 카드로 늘어놓는다(plan.md 75행). 화면이 하는 일의 순서가
 * 중요하다 — **먼저 올리고, 그다음 읽는다**(`useUsageSync`). 반대로 하면 내가 방금
 * 쓴 시간만 빠진 값이 그려진다.
 */
export default function TodayScreen() {
  const profile = useMyProfile();
  const groups = useMyGroups();
  const usages = useGroupUsages(groups.data);
  const sync = useUsageSync();

  const refresh = async () => {
    await sync.sync();
    await groups.refetch();
  };

  return (
    <Screen onRefresh={refresh} refreshing={sync.isSyncing || usages.isFetching}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <ThemedText type="label" themeColor="accent">
            오늘
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            {sync.isSyncing ? '동기화 중…' : (sync.lastError ?? sync.lastMessage ?? '')}
          </ThemedText>
        </View>

        <ThemedText type="subtitle">{formatDateKey(frimitDateKey(new Date(), DEFAULT_TIME_ZONE))}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          하루는 오전 6시에 새로 시작해요
        </ThemedText>
      </View>

      {groups.isPending ? (
        <ThemedText type="small" themeColor="textSecondary">
          그룹을 읽고 있어요
        </ThemedText>
      ) : groups.error ? (
        <FailureCard
          message={groups.error instanceof Error ? groups.error.message : String(groups.error)}
          onRetry={() => groups.refetch()}
        />
      ) : groups.data.length === 0 ? (
        <EmptyGroups />
      ) : (
        groups.data.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            usage={usages.byGroupId.get(group.id)}
            myProfileId={profile.data?.id}
            // 시작 대기 카드만 갈 곳이 있다. 활성 그룹의 상세 화면은 아직 없으므로
            // 눌러도 아무 일 없는 카드를 만들지 않는다.
            onPress={
              group.status === 'draft'
                ? () => router.push({ pathname: '/ready', params: { groupId: group.id } })
                : undefined
            }
          />
        ))
      )}
    </Screen>
  );
}

/**
 * 그룹이 없을 때.
 *
 * 빈 화면은 분위기를 잡는 자리가 아니라 다음 행동을 부르는 자리다. 온보딩을 마친
 * 사람이 마지막 그룹에서 탈퇴하면 여기로 오게 된다.
 */
function EmptyGroups() {
  return (
    <Card>
      <ThemedText type="metric">아직 그룹이 없어요</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        공동 풀은 혼자서는 만들 수 없어요. 그룹을 만들어 친구에게 초대 코드를 보내거나, 받은
        코드로 참여해 보세요.
      </ThemedText>
      <Button label="그룹 만들기" onPress={() => router.push('/group')} />
    </Card>
  );
}

function FailureCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <ThemedText type="metric">공동 풀을 읽지 못했어요</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {message}
      </ThemedText>
      <Button label="다시 시도" variant="quiet" onPress={onRetry} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
