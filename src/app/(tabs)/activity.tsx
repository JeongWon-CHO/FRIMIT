import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActivityItem, DayDivider } from '@/components/activity-item';
import { TitleRow } from '@/components/title-row';
import { AppText, EmptyState, GradientButton, ScreenFrame } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { useActivity, useReact } from '@/hooks/use-activity';
import { useMyProfile } from '@/hooks/use-profile';
import { groupByDay } from '@/lib/activity-view';

/**
 * 활동 탭.
 *
 * 그룹 통합 흐름 하나다(plan.md 78행). 그룹별로 탭을 나누지 않는 이유는, 이 화면이
 * 답해야 하는 질문이 "우리 그룹에서 무슨 일이 있었나"가 아니라 "내가 놓친 게
 * 있나"이기 때문이다. 그룹 이름은 각 줄에 작게 붙는다.
 *
 * 카드가 아니라 흐름이다. 항목 사이 간격이 4밖에 안 되는 것이 그 성격을 지킨다.
 */
export default function ActivityScreen() {
  const profile = useMyProfile();
  const activity = useActivity();
  const react = useReact();

  const days = groupByDay(activity.data ?? [], profile.data?.id);

  return (
    <ScreenFrame
      ambient={{ color: colors.accent.cyan, size: 380, opacity: 0.22, x: 330, y: 140 }}
      onRefresh={() => activity.refetch()}>
      <TitleRow title="Activity" />

      {activity.isPending ? (
        <EmptyState title="읽는 중이에요" body="최근 사건을 불러오고 있어요." />
      ) : activity.error ? (
        <EmptyState
          title="활동을 읽지 못했어요"
          body={activity.error instanceof Error ? activity.error.message : String(activity.error)}
          action={<GradientButton label="다시 시도" size="md" onPress={() => activity.refetch()} />}
        />
      ) : days.length === 0 ? (
        <EmptyState
          title="오늘은 조용하네요"
          body="한도 75·90·100% 도달, 초과, 목표 기록, 멤버·규칙 변경이 그룹 통합 흐름으로 여기에 쌓여요."
        />
      ) : (
        <View style={styles.list}>
          {days.map((day) => (
            <Fragment key={day.label}>
              <DayDivider label={day.label} />
              {day.rows.map((row) => (
                <ActivityItem
                  key={row.id}
                  row={row}
                  onReact={(emoji) => react.mutate({ eventId: row.id, emoji })}
                />
              ))}
            </Fragment>
          ))}
        </View>
      )}

      {days.length > 0 && (
        <AppText variant="metadata" tone="faint" style={styles.footer}>
          활동 내역은 90일 동안 남아요.
        </AppText>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  footer: { textAlign: 'center', paddingTop: 18 },
});
