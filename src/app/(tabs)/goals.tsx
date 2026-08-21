import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";

import { GoalHeroCard, GoalTile } from "@/components/goal-card";
import { TitleRow } from "@/components/title-row";
import {
  AppText,
  EmptyState,
  GradientButton,
  ScreenFrame,
} from "@/components/ui";
import { colors, radius as radii, spacing } from "@/constants/design-tokens";
import {
  useCancelGoal,
  useDeleteGoalEntry,
  useGroupGoals,
  useRecordGoalEntry,
} from "@/hooks/use-goals";
import { useMyGroups } from "@/hooks/use-groups";
import { useMyProfile } from "@/hooks/use-profile";
import { hexToRgba } from "@/lib/color";
import { buildGoalView, pickHeroGoal, type GoalView } from "@/lib/goal-view";
import { queryKeys } from "@/lib/query";

/**
 * 목표 탭.
 *
 * 읽는 순서는 **우리 진행률 → 목표 이름 → 각자의 몫**이다. 개인 숫자가 그룹
 * 퍼센트보다 커 보이면 이 화면은 실패한 것이다 — 여기서도 주어는 '우리'다.
 *
 * 목표 상세 화면은 없다. 그리드 카드를 누르면 그 목표가 히어로로 올라온다.
 * 오늘 화면이 그룹 카드를 다루는 방식과 같고(`setPreferredGroupId`), 화면 하나로
 * 끝나므로 기록 입력칸도 한 자리에만 있으면 된다.
 */
export default function GoalsScreen() {
  const profile = useMyProfile();
  const groups = useMyGroups();
  const goals = useGroupGoals(groups.data);
  const queryClient = useQueryClient();

  const [preferredGroupId, setPreferredGroupId] = useState<string | null>(null);

  const views = useMemo(
    () =>
      (groups.data ?? [])
        .map((group) =>
          buildGoalView(group, goals.byGroupId.get(group.id), profile.data?.id),
        )
        .filter((view): view is GoalView => Boolean(view)),
    [groups.data, goals.byGroupId, profile.data?.id],
  );

  const hero = pickHeroGoal(views, preferredGroupId);
  const others = views.filter((view) => view.goalId !== hero?.goalId);

  const heroGroup = (groups.data ?? []).find(
    (group) => group.id === hero?.groupId,
  );
  const canCancel =
    hero &&
    (hero.createdBy === profile.data?.id ||
      heroGroup?.admin_id === profile.data?.id);

  const startedGroups = (groups.data ?? []).filter(
    (group) => group.status === "active",
  );
  const cancel = useCancelGoal();

  return (
    <ScreenFrame
      ambient={{
        color: colors.accent.indigo,
        size: 380,
        opacity: 0.26,
        x: 60,
        y: 140,
      }}
      // 그룹 목록만 다시 읽으면 정작 목표는 그대로다. 목표는 그룹마다 다른
      // 쿼리라(`['groups', id, 'goal']`) 접두사째 비우는 편이 맞다.
      onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups })}
    >
      <TitleRow
        title="목표"
        right={
          startedGroups.length > 0 ? (
            <AddButton onPress={() => router.push("/goal/new")} />
          ) : undefined
        }
      />

      {groups.isPending || goals.isPending ? (
        <EmptyState title="읽는 중이에요" body="목표를 불러오고 있어요." />
      ) : startedGroups.length === 0 ? (
        <EmptyState
          title="먼저 그룹을 시작해요"
          body="공동 목표는 시작한 그룹에만 걸 수 있어요. 친구 한 명만 준비되면 시작할 수 있어요."
          action={
            <GradientButton
              label="그룹 만들기"
              size="md"
              onPress={() => router.push("/group")}
            />
          }
        />
      ) : !hero ? (
        <EmptyState
          title="아직 목표가 없어요"
          body="그룹 하나에 공동 목표 하나를 걸고 7·14·30일 중에 기간을 골라요.
진행률은 각자의 달성률을 100%에서 끊어 평균한 값이에요."
          action={
            <GradientButton
              label="목표 만들기"
              size="md"
              onPress={() => router.push("/goal/new")}
            />
          }
        />
      ) : (
        <>
          <GoalHeroCard view={hero} footer={<RecordRow view={hero} />} />

          {others.length > 0 && (
            <View style={styles.grid}>
              {others.map((view) => (
                <View key={view.goalId} style={styles.half}>
                  <GoalTile
                    view={view}
                    onPress={() => setPreferredGroupId(view.groupId)}
                  />
                </View>
              ))}
            </View>
          )}

          {canCancel && (
            <GradientButton
              label="이 목표 그만두기"
              variant="tertiary"
              onPress={() =>
                Alert.alert(
                  "목표를 그만둘까요?",
                  "지금까지의 기록이 함께 사라져요. 그룹은 그대로예요.",
                  [
                    { text: "아니요", style: "cancel" },
                    {
                      text: "그만두기",
                      style: "destructive",
                      onPress: () => cancel.mutate(hero.goalId),
                    },
                  ],
                )
              }
            />
          )}
        </>
      )}

      {goals.error && (
        <AppText variant="metadata" tone="stale" style={styles.center}>
          {goals.error instanceof Error
            ? goals.error.message
            : String(goals.error)}
        </AppText>
      )}
    </ScreenFrame>
  );
}

/**
 * 오늘 몫을 적는 자리.
 *
 * 하루에 한 줄이므로 이미 적은 날에는 그 값이 칸에 들어가 있고 버튼이 '수정'이
 * 된다. 어제 것은 여기서도 서버에서도 손댈 수 없다(plan.md 49행).
 */
function RecordRow({ view }: { view: GoalView }) {
  const record = useRecordGoalEntry();
  const remove = useDeleteGoalEntry();
  const [draft, setDraft] = useState<string | null>(null);

  if (!view.canRecord) {
    return (
      <View style={styles.footer}>
        <AppText variant="metadata" tone="faint" style={styles.center}>
          {view.started
            ? "이 목표의 참여자가 아니에요. 다음 목표부터 함께해요."
            : "내일 오전 6시부터 기록할 수 있어요."}
        </AppText>
      </View>
    );
  }

  const recorded = view.myAmountToday;
  const value = draft ?? (recorded === null ? "" : String(recorded));
  const amount = Number(value);
  const valid = Number.isFinite(amount) && amount > 0;

  const submit = async () => {
    if (!valid) return;
    await record.mutateAsync({ goalId: view.goalId, amount });
    setDraft(null);
  };

  return (
    <View style={styles.footer}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.text.faint}
          style={styles.input}
          selectionColor={colors.accent.violetSoft}
        />
        <AppText variant="bodyStrong" tone="muted">
          {view.unit}
        </AppText>
        <View style={styles.submit}>
          <GradientButton
            label={recorded === null ? "오늘 기록" : "수정"}
            size="md"
            disabled={!valid}
            loading={record.isPending}
            onPress={submit}
          />
        </View>
      </View>

      {recorded !== null && (
        <Pressable
          onPress={() => remove.mutate(view.goalId)}
          disabled={remove.isPending}
        >
          <AppText variant="metadata" tone="faint" style={styles.center}>
            오늘 기록 지우기
          </AppText>
        </Pressable>
      )}

      {record.error && (
        <AppText variant="metadata" tone="stale" style={styles.center}>
          {record.error instanceof Error
            ? record.error.message
            : String(record.error)}
        </AppText>
      )}
    </View>
  );
}

/** 제목 줄 오른쪽의 38px 원형 버튼. */
function AddButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="목표 만들기"
      onPress={onPress}
      style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}
    >
      <AppText variant="cardTitle">+</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.gridGap },
  half: { width: "48%", flexGrow: 1 },
  center: { textAlign: "center" },
  footer: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border.hairline,
    gap: 10,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    flex: 1,
    height: 46,
    borderRadius: radii.button,
    paddingHorizontal: 16,
    backgroundColor: hexToRgba("#FFFFFF", 0.05),
    borderWidth: 1,
    borderColor: colors.border.hairline,
    color: colors.text.primary,
    fontSize: 19,
    fontWeight: "800",
  },
  submit: { minWidth: 96 },
  add: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
});
