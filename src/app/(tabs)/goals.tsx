import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";

import { GoalHeroCard, GoalTile } from "@/components/goal-card";
import { TitleRow } from "@/components/title-row";
import {
  ActionSheet,
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
  const [confirmingCancel, setConfirmingCancel] = useState(false);

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
  const live = views.filter((view) => !view.ended);
  const past = views.filter((view) => view.ended);

  const heroGroup = (groups.data ?? []).find(
    (group) => group.id === hero?.groupId,
  );
  const canCancel =
    hero &&
    // 끝난 목표는 그만둘 것이 없다. 이미 끝났다.
    !hero.ended &&
    (hero.createdBy === profile.data?.id ||
      heroGroup?.admin_id === profile.data?.id);

  const startedGroups = (groups.data ?? []).filter(
    (group) => group.status === "active",
  );
  const cancel = useCancelGoal();

  // 버튼이 어느 목표의 것인지 이름으로 말한다. 30자까지 오는 제목을 버튼에 통째로
  // 실으면 두 줄이 되므로 여기서 끊는다 — 확인 시트에는 온전한 제목이 나온다.
  const heroLabel =
    hero && (hero.title.length > 14 ? `${hero.title.slice(0, 13)}…` : hero.title);

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

          {/*
            그만두기는 **히어로 바로 아래**다. 예전에는 그리드 밑에 있었는데, 그
            자리에서는 방금 지나온 작은 카드들 중 무엇을 그만두는지 알 수 없었다.
            지우는 버튼은 지워질 것에 붙어 있어야 한다.
          */}
          {canCancel && (
            <GradientButton
              label={`'${heroLabel}' 그만두기`}
              variant="tertiary"
              onPress={() => setConfirmingCancel(true)}
            />
          )}

          {/*
            히어로에 올라온 목표도 그리드에 남는다. 오늘 화면이 그룹 카드를 다루는
            방식과 같다 — **목록은 고정이고 강조만 움직인다.**

            빼면 카드를 누르는 순간 그 카드가 목록에서 사라지고 그 자리에 방금 위에
            있던 것이 나타난다. 손가락 밑에서 목록이 재배치되는 셈이라, 무엇을
            눌렀는지도 몇 개를 가졌는지도 알 수 없게 된다. 위아래는 강조색 테두리로
            잇는다.

            다만 홈과 다른 점이 하나 있다 — **그룹은 끝나지 않지만 목표는 끝난다.**
            끝난 목표를 진행 중인 것과 같은 줄에 두면 "지금 적을 수 있는 것"이
            무엇인지 한눈에 안 들어온다. 그래서 아래로 따로 뺀다.

            '완료'라고 부르지 않는다. 78%로 끝난 것도 여기 오고, 이 앱은 달성과
            미달성을 판정하지 않는다(plan.md의 어투). 시간만 말한다.
          */}
          <GoalSection
            title="내 목표"
            views={live}
            heroId={hero.goalId}
            onPick={setPreferredGroupId}
          />
          <GoalSection
            title="지난 목표"
            views={past}
            heroId={hero.goalId}
            onPick={setPreferredGroupId}
          />

          {/*
            확인은 시스템 알림창이 아니라 바텀시트다(`ActionSheet`의 규칙, 그룹
            나가기와 같다). 제목에 목표 이름을 그대로 넣는 것이 여기서 가장 중요한
            한 줄이다 — 조사(을/를)를 붙이지 않아도 되도록 제목 자리에 둔다.
          */}
          <ActionSheet
            visible={confirmingCancel}
            title={`'${hero.title}' 그만둘까요?`}
            message="지금까지의 기록이 함께 사라지고 되돌릴 수 없어요. 그룹은 그대로예요."
            onClose={() => setConfirmingCancel(false)}
            actions={[
              {
                label: "그만두기",
                danger: true,
                onPress: () =>
                  cancel.mutate(hero.goalId, {
                    // 실패는 알림창으로 남긴다. 시트는 이미 닫혔고, 이건 확인이
                    // 아니라 사고다.
                    onError: (error) =>
                      Alert.alert(
                        "그만두지 못했어요",
                        error instanceof Error ? error.message : String(error),
                      ),
                  }),
              },
            ]}
          />
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

/** 제목 한 줄과 그 아래 카드들. 비어 있으면 제목도 그리지 않는다. */
function GoalSection({
  title,
  views,
  heroId,
  onPick,
}: {
  title: string;
  views: GoalView[];
  heroId: string;
  onPick: (groupId: string) => void;
}) {
  if (views.length === 0) return null;

  return (
    <>
      <View style={styles.sectionTitle}>
        <AppText variant="sectionTitle">{title}</AppText>
        <AppText variant="metadata" tone="metadata">
          {views.length}
        </AppText>
      </View>

      <View style={styles.grid}>
        {views.map((view) => (
          <View key={view.goalId} style={styles.half}>
            <GoalTile
              view={view}
              selected={view.goalId === heroId}
              onPress={() => onPick(view.groupId)}
            />
          </View>
        ))}
      </View>
    </>
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

  // 끝난 목표. 7일 동안 결과만 남고, 다음 걸음은 새 목표다.
  if (view.ended) {
    return (
      <View style={styles.footer}>
        <AppText variant="metadata" tone="faint" style={styles.center}>
          이 목표는 끝났어요. 결과는 일주일 동안 여기 남아 있어요.
        </AppText>
        <GradientButton
          label="새 목표 걸기"
          size="md"
          onPress={() => router.push("/goal/new")}
        />
      </View>
    );
  }

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

  // mutateAsync를 await하면 실패했을 때 아무도 잡지 않는 거절이 남는다. 오류는
  // 아래 줄에 이미 보여주고 있으므로 콜백으로 받는다.
  const submit = () => {
    if (!valid) return;
    record.mutate({ goalId: view.goalId, amount }, { onSuccess: () => setDraft(null) });
  };

  return (
    <View style={styles.footer}>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.text.placeholder}
          maxLength={11}
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
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingTop: 2,
  },
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
