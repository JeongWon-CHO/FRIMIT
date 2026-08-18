import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { OnboardingStep } from '@/components/onboarding-step';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  readyCount,
  useGroupMembers,
  useMyGroups,
  useSetReady,
  useStartGroup,
} from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useTrackingState } from '@/hooks/use-tracking';
import { READY_MEMBERS_TO_START } from '@/lib/groups';
import { markProgress } from '@/lib/onboarding';
import { armTracking, isUsable } from '@/lib/tracking';

/**
 * 6단계 · 준비 완료와 그룹 시작.
 *
 * 온보딩의 마지막이면서, 오늘 화면의 `시작 대기` 카드가 눌렸을 때 오는 화면이기도
 * 하다(`?groupId=`). 시작 대기는 며칠 걸릴 수 있는 상태라 온보딩 안에만 두면 갈 곳이 없다.
 *
 * 준비 완료를 켤 수 있는 조건은 클라이언트가 지킨다. 서버의 `is_ready`는 멤버가
 * 직접 UPDATE하는 유일한 컬럼이라 "권한 있고 대상을 골랐는가"를 검사하지 않는다.
 * 그 규칙은 제품 쪽에 있다 — 권한을 거부한 사람은 공동 집계의 준비 멤버로 인정하지
 * 않는다(plan.md 71행). 이걸 화면이 안 막으면 아무것도 올리지 못하는 사람이 시작
 * 정족수를 채우고, 그룹은 시작됐는데 공동 풀은 비어 있는 상태가 된다.
 */
export default function ReadyScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ groupId?: string }>();

  const profile = useMyProfile();
  const groups = useMyGroups();
  const group =
    groups.data?.find((candidate) => candidate.id === params.groupId) ?? groups.data?.[0];

  const members = useGroupMembers(group?.id);
  const tracking = useTrackingState(group?.id);
  const setReady = useSetReady(group?.id);
  const startGroup = useStartGroup();

  const me = members.data?.find((member) => member.profile_id === profile.data?.id);
  const ready = readyCount(members.data);
  const canStart = ready >= READY_MEMBERS_TO_START;
  const isAdmin = group?.admin_id === profile.data?.id;
  const isDraft = group?.status === 'draft';

  const blockedReason = !isUsable(tracking.permission)
    ? '사용량 권한이 필요해요'
    : tracking.selectionCount === 0
      ? '추적할 앱을 먼저 골라 주세요'
      : null;

  const start = async () => {
    if (!group) return;
    await startGroup.mutateAsync(group.id);
    // 시작하는 순간부터 서버가 스냅샷을 받는다. 구간을 여기서 무장해 두지 않으면
    // 첫 값이 다음 앱 실행까지 밀린다.
    await armTracking(group.id, group.time_zone);
  };

  const finish = async () => {
    await markProgress({ done: true });
    router.replace('/');
  };

  return (
    <OnboardingStep
      step="ready"
      eyebrow="시작"
      title={isDraft ? '친구를 기다리는 중' : '준비됐어요'}
      description={
        isDraft
          ? `준비한 친구가 ${READY_MEMBERS_TO_START}명이 되면 관리자가 집계를 시작할 수 있어요.`
          : '이 그룹은 이미 집계 중이에요.'
      }
      footer={
        <>
          {isDraft && isAdmin && (
            <Button
              label={canStart ? '그룹 시작하기' : `준비 ${ready}/${READY_MEMBERS_TO_START}명`}
              onPress={start}
              disabled={!canStart}
              loading={startGroup.isPending}
            />
          )}
          <Button
            label="오늘 화면으로"
            variant={isDraft && isAdmin ? 'plain' : 'primary'}
            onPress={finish}
          />
        </>
      }>
      {group ? (
        <Card>
          <View style={styles.titleRow}>
            <ThemedText type="metric">{group.name}</ThemedText>
            <View style={[styles.chip, { backgroundColor: theme.accentQuiet }]}>
              <ThemedText type="label" themeColor="accent">
                {isDraft ? '시작 대기' : '집계 중'}
              </ThemedText>
            </View>
          </View>

          {isDraft && (
            <View style={[styles.inviteBox, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="label" themeColor="textSecondary">
                초대 코드
              </ThemedText>
              <ThemedText type="metric" style={styles.inviteCode}>
                {group.invite_code}
              </ThemedText>
            </View>
          )}
        </Card>
      ) : (
        <Card>
          <ThemedText type="metric">그룹이 없어요</ThemedText>
          <Button label="그룹 만들기" variant="quiet" onPress={() => router.push('/group')} />
        </Card>
      )}

      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          내 준비 상태
        </ThemedText>

        {blockedReason ? (
          <>
            <ThemedText type="small" themeColor="caution">
              {blockedReason}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              준비를 켜도 사용량이 올라가지 않아요. 먼저 준비를 마친 뒤 켜는 게 좋아요.
            </ThemedText>
            <Button
              label={tracking.permission === 'granted' ? '앱 고르기' : '권한 화면으로'}
              variant="quiet"
              onPress={() =>
                router.push(tracking.permission === 'granted' ? '/tracking' : '/permission')
              }
            />
          </>
        ) : (
          <Button
            label={me?.is_ready ? '준비 취소' : '준비 완료'}
            variant={me?.is_ready ? 'quiet' : 'primary'}
            onPress={() => setReady.mutate(!me?.is_ready)}
            loading={setReady.isPending}
          />
        )}
      </Card>

      {members.data && members.data.length > 0 && (
        <Card>
          <ThemedText type="label" themeColor="textSecondary">
            멤버 {members.data.length}명 · 준비 {ready}명
          </ThemedText>

          {members.data.map((member) => (
            <View key={member.profile_id} style={styles.memberRow}>
              <Avatar avatarKey={member.avatar_key} size={32} />
              <ThemedText type="small" numberOfLines={1} style={styles.memberName}>
                {member.nickname}
                {member.profile_id === profile.data?.id ? ' (나)' : ''}
              </ThemedText>
              <ThemedText
                type="small"
                themeColor={member.is_ready ? 'positive' : 'textSecondary'}>
                {member.is_ready ? '준비됨' : '준비 안 됨'}
              </ThemedText>
            </View>
          ))}
        </Card>
      )}

      {startGroup.error ? (
        <ThemedText type="small" themeColor="over">
          {startGroup.error instanceof Error ? startGroup.error.message : String(startGroup.error)}
        </ThemedText>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  memberName: {
    flex: 1,
  },
});
