import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useMyGroups } from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useTrackingState } from '@/hooks/use-tracking';
import { formatClock } from '@/lib/format';
import { resetProgress } from '@/lib/onboarding';
import { describePermission } from '@/lib/tracking';

/**
 * MY 탭.
 *
 * plan.md 78행의 전체(활성 기기, 그룹별 추적 설정, 알림 음소거, 로그아웃·계정 삭제)는
 * 아직 아니다. 지금 여기 있는 것은 **실기기에서 상태를 눈으로 확인해야 하는 값들**이다 —
 * 권한이 살아 있는지, 몇 개를 고르고 있는지, 그리고 계측 화면으로 가는 문.
 */
export default function MyScreen() {
  const profile = useMyProfile();
  const groups = useMyGroups();
  const firstGroup = groups.data?.[0];
  const tracking = useTrackingState(firstGroup?.id);

  return (
    <Screen>
      <ThemedText type="subtitle">MY</ThemedText>

      <Card>
        <View style={styles.identity}>
          <Avatar avatarKey={profile.data?.avatar_key ?? 'avatar-01'} size={56} />
          <View style={styles.identityText}>
            <ThemedText type="metric">{profile.data?.nickname ?? '…'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              참여 중인 그룹 {groups.data?.length ?? 0}개
            </ThemedText>
          </View>
        </View>
        <Button label="닉네임·아바타 바꾸기" variant="quiet" onPress={() => router.push('/nickname')} />
      </Card>

      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          이 기기
        </ThemedText>
        <Row label="사용량 권한" value={describePermission(tracking.permission)} />
        <Row
          label="추적 대상"
          value={firstGroup ? `${tracking.selectionCount}개 선택` : '그룹이 없어요'}
        />
        <Row
          label="선택 변경"
          value={
            tracking.selectionUpdatedAt
              ? formatClock(new Date(tracking.selectionUpdatedAt).toISOString())
              : '없음'
          }
        />
        {firstGroup && (
          <Button
            label="추적 대상 다시 고르기"
            variant="quiet"
            onPress={() => router.push('/tracking')}
          />
        )}
      </Card>

      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          개발용
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          스파이크 화면은 실기기 측정 도구예요. docs/spike-protocol.md의 항목을 이 화면에서 재요.
        </ThemedText>
        <Button label="스파이크 화면 열기" variant="quiet" onPress={() => router.push('/spike')} />
        <Button
          label="온보딩 다시 보기"
          variant="plain"
          onPress={async () => {
            await resetProgress();
            router.replace('/welcome');
          }}
        />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  identityText: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
