import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, GradientButton, ScreenFrame, StatusPill } from '@/components/ui';
import { colors, radius as radii } from '@/constants/design-tokens';
import { useCreateGoal, useGroupGoals } from '@/hooks/use-goals';
import { useMyGroups } from '@/hooks/use-groups';
import { hexToRgba } from '@/lib/color';
import { isEnded } from '@/lib/goal-view';
import { DURATION_CHOICES, type DurationDays } from '@/lib/goals';
import { groupAccent } from '@/lib/today';

/**
 * 목표 만들기.
 *
 * 한 화면에 네 가지를 받는다 — 그룹, 이름, 1인 목표량과 단위, 기간. 단계로
 * 쪼개지 않는 이유는 넷이 서로를 설명하기 때문이다. "5번"이 무엇인지는 "7일"과
 * 함께 읽어야 알 수 있다.
 *
 * 단위는 자유 입력이다(plan.md 45행). 서버도 해석하지 않고 길이만 본다 —
 * 목록을 만들면 "쪽"과 "페이지"를 두고 다투게 되고, 그 다툼에서 나오는 것이 없다.
 *
 * 시작은 항상 다음 오전 6시다. 고를 수 있는 값이 아니므로 묻지 않고 알려만 준다.
 */
export default function CreateGoalScreen() {
  const groups = useMyGroups();
  const create = useCreateGoal();

  const startedGroups = (groups.data ?? []).filter((group) => group.status === 'active');

  // 이미 목표가 돌고 있는 그룹은 고를 수 없다(plan.md 42행, 서버의 `goal_already_exists`).
  // 화면이 이미 아는 거절을 서버까지 보내지 않는다 — 목록은 목표 탭이 방금 읽어
  // 캐시에 있으므로 왕복도 대개 없다. **끝난 목표는 막지 않는다.** 결과 카드가
  // 일주일 남아 있을 뿐, 그 그룹은 새 목표를 걸 수 있는 상태다.
  const goals = useGroupGoals(startedGroups);
  const taken = new Set(
    [...goals.byGroupId.values()]
      .filter((snapshot) => !isEnded(snapshot.goal.ends_at))
      .map((snapshot) => snapshot.goal.group_id)
  );
  const openGroups = startedGroups.filter((group) => !taken.has(group.id));

  const [groupId, setGroupId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('번');
  const [durationDays, setDurationDays] = useState<DurationDays>(7);

  const selectedGroupId = groupId ?? openGroups[0]?.id ?? null;
  const trimmedTitle = title.trim();
  const parsedAmount = Number(amount);
  const valid =
    Boolean(selectedGroupId) &&
    trimmedTitle.length > 0 &&
    unit.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const submit = () => {
    if (!valid || !selectedGroupId) return;
    // 실패하면 오류는 아래 버튼 위에 뜬다. await로 받으면 잡는 사람 없는 거절만 남는다.
    create.mutate(
      {
        groupId: selectedGroupId,
        title: trimmedTitle,
        targetAmount: parsedAmount,
        unit: unit.trim(),
        durationDays,
      },
      { onSuccess: () => router.back() }
    );
  };

  return (
    <ScreenFrame
      bottomInset={24}
      footer={
        <View style={styles.footer}>
          {create.error && (
            <AppText variant="metadata" tone="over">
              {create.error instanceof Error ? create.error.message : String(create.error)}
            </AppText>
          )}
          <GradientButton
            label="목표 만들기"
            onPress={submit}
            disabled={!valid}
            loading={create.isPending}
          />
          <GradientButton label="그만두기" variant="tertiary" onPress={() => router.back()} />
        </View>
      }>
      <AppText variant="screenTitle" font="display" style={styles.title}>
        새 목표
      </AppText>

      {/*
        그룹이 하나뿐이면 고를 것이 없다. 알약 하나로 어디에 거는지만 말한다.

        여럿일 때는 **고를 수 있다는 것부터 보여야 한다.** 예전에는 고른 것이
        보라 알약(12%), 나머지가 유리 알약(7%)이었는데 근-검정 배경에서 그 둘은
        같은 색으로 보였다. 누른 티도 안 나서, 첫 그룹이 고정된 라벨처럼 읽혔다.
        고르지 않은 것을 흐리게 두면 한눈에 "이 중 하나"가 된다.
      */}
      <AppText variant="eyebrow" tone="faint">
        GROUP
      </AppText>
      <View style={styles.groupRow}>
        {startedGroups.map((group) => {
          const selected = group.id === selectedGroupId;
          const busy = taken.has(group.id);
          return (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: busy }}
              disabled={busy}
              onPress={() => setGroupId(group.id)}
              style={({ pressed }) => [
                busy ? styles.groupBusy : !selected && styles.groupDim,
                pressed && styles.groupPressed,
              ]}>
              <StatusPill
                label={group.name}
                dotColor={colors.groupAccent[groupAccent(group)].dot}
                tone={selected ? 'violet' : 'glass'}
              />
            </Pressable>
          );
        })}
      </View>

      {taken.size > 0 && (
        <AppText variant="metadata" tone="faint">
          {openGroups.length === 0
            ? '모든 그룹에 이미 목표가 있어요. 하나가 끝나거나 그만두면 새로 걸 수 있어요.'
            : '흐린 그룹은 이미 목표가 돌고 있어요. 그룹당 하나예요.'}
        </AppText>
      )}

      <AppText variant="eyebrow" tone="faint" style={styles.label}>
        GOAL
      </AppText>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="이번 주 5번 운동하기"
        placeholderTextColor={colors.text.placeholder}
        maxLength={30}
        returnKeyType="done"
        style={styles.field}
        accessibilityLabel="목표 이름"
      />

      <AppText variant="eyebrow" tone="faint" style={styles.label}>
        각자 얼마나
      </AppText>
      <View style={styles.amountRow}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="5"
          placeholderTextColor={colors.text.placeholder}
          maxLength={11}
          style={[styles.field, styles.amountField]}
          accessibilityLabel="1인 목표량"
        />
        <TextInput
          value={unit}
          onChangeText={setUnit}
          placeholder="번"
          placeholderTextColor={colors.text.placeholder}
          maxLength={8}
          style={[styles.field, styles.unitField]}
          accessibilityLabel="단위"
        />
      </View>
      <AppText variant="metadata" tone="faint">
        참여자 모두에게 같은 목표량이 걸려요. 그룹 진행률은 각자의 달성률을 100%에서 끊어
        평균한 값이에요.
      </AppText>

      <AppText variant="eyebrow" tone="faint" style={styles.label}>
        기간
      </AppText>
      <View style={styles.durationRow}>
        {DURATION_CHOICES.map((days) => {
          const selected = days === durationDays;
          return (
            <Pressable
              key={days}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setDurationDays(days)}
              style={[styles.duration, selected && styles.durationSelected]}>
              <AppText variant="bodyStrong" tone={selected ? 'primary' : 'muted'}>
                {days}일
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="metadata" tone="faint">
        내일 오전 6시에 시작해요. 그때 그룹에 있는 사람들이 참여자가 되고, 그 뒤에 들어온
        친구는 다음 목표부터 함께해요.
      </AppText>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 8 },
  label: { marginTop: 10 },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupDim: { opacity: 0.42 },
  // 고를 수 없는 것은 고를 수 있는데 안 고른 것보다 더 물러나 있어야 한다.
  groupBusy: { opacity: 0.22 },
  groupPressed: { opacity: 0.65 },
  field: {
    borderRadius: radii.button,
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    borderWidth: 1,
    borderColor: hexToRgba(colors.accent.violetSoft, 0.3),
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  amountRow: { flexDirection: 'row', gap: 10 },
  amountField: { flex: 1 },
  unitField: { width: 104 },
  durationRow: { flexDirection: 'row', gap: 10 },
  duration: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    backgroundColor: hexToRgba('#FFFFFF', 0.03),
  },
  durationSelected: {
    borderColor: hexToRgba(colors.accent.violetSoft, 0.45),
    backgroundColor: hexToRgba(colors.accent.violet, 0.16),
  },
  footer: { gap: 10 },
});
