import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  BackButton,
  NumericTimeSelector,
  OnboardingFrame,
  SHARED_TIME_DEFAULT,
} from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { useProposeDailyLimit, useUpdateDraftDailyLimit } from '@/hooks/use-rules';
import { useScreenGroup } from '@/hooks/use-screen-group';

/**
 * 공동 시간 바꾸기.
 *
 * 한 화면이 두 가지 일을 한다. **시작 전 그룹은 바로 반영**되고(관리자만), 시작한
 * 그룹은 **활성 멤버 전원의 동의**를 받아 다음 오전 6시에 적용된다(plan.md 36행).
 * 고르는 방법이 같은데 화면을 둘로 나눌 이유가 없다 — 다른 것은 버튼의 이름과
 * 그 아래 한 줄뿐이다.
 *
 * 오늘 한가운데서 한도가 바뀌면 아침부터 아껴 쓴 사람의 계산이 무너진다. 그래서
 * 시작한 그룹에는 즉시 반영이라는 선택지가 아예 없다.
 */
export default function ChangeLimitScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  const groups = useMyGroups();
  const group = useScreenGroup(groups.data, groupId);
  const usages = useGroupUsages(group ? [group] : []);
  const usage = group ? usages.byGroupId.get(group.id) : undefined;

  const propose = useProposeDailyLimit();
  const updateDraft = useUpdateDraftDailyLimit();

  const draft = group?.status === 'draft';
  const currentMinutes = usage ? Math.round(usage.daily_limit_seconds / 60) : SHARED_TIME_DEFAULT;

  /*
   * 사용자가 손대기 전에는 상태를 들지 않는다. 서버 값이 늦게 도착하는데 그걸
   * 상태로 복사해 두면 초깃값이 8h로 굳어서, 실제로는 6h인 그룹의 화면이 8h를
   * 보여주고 "바꾼 것 없음"으로 저장된다.
   */
  const [picked, setPicked] = useState<number | null>(null);
  const minutes = picked ?? currentMinutes;
  const unchanged = !usage || minutes * 60 === usage.daily_limit_seconds;

  const submit = async () => {
    if (!group) return;

    try {
      if (draft) {
        await updateDraft.mutateAsync({ groupId: group.id, dailyLimitSeconds: minutes * 60 });
      } else {
        await propose.mutateAsync({ groupId: group.id, dailyLimitSeconds: minutes * 60 });
      }
      router.back();
    } catch (error) {
      Alert.alert('바꾸지 못했어요', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <OnboardingFrame
      footer={
        <ButtonStack>
          <GradientButton
            label={draft ? '저장' : '변경 제안하기'}
            onPress={submit}
            disabled={unchanged}
            loading={propose.isPending || updateDraft.isPending}
          />
          <AppText variant="metadata" tone="faint" style={styles.note}>
            {draft
              ? '아직 시작하지 않은 그룹이라 바로 반영돼요.'
              : '친구들이 모두 동의하면 다음 날 오전 6시부터 적용돼요.'}
          </AppText>
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          <BackButton />
        </View>

        <AppText variant="screenTitle" style={styles.title}>
          공동 시간 바꾸기
        </AppText>
        <AppText variant="body" tone="muted">
          {group?.name ?? '이 그룹'}이 하루에 함께 쓰는 시간이에요.
        </AppText>

        <View style={styles.selector}>
          <NumericTimeSelector valueMinutes={minutes} onChange={setPicked} />
        </View>
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 10 },
  navRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 30, lineHeight: 38, paddingTop: 8 },
  selector: { paddingTop: 14 },
  note: { textAlign: 'center' },
});
