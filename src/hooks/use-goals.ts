import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';

import {
  cancelGoal,
  createGoal,
  deleteGoalEntry,
  fetchCurrentGoal,
  recordGoalEntry,
  type DurationDays,
  type GoalSnapshot,
} from '@/lib/goals';
import type { MyGroup } from '@/lib/groups';
import { queryKeys } from '@/lib/query';

/**
 * 그룹별 목표를 한꺼번에 읽는다.
 *
 * `useGroupUsages`와 같은 모양이고 같은 이유다 — 그룹 하나의 왕복이 실패해도
 * 나머지 카드는 그대로 보여야 한다. 목표가 없는 그룹은 서버가 null을 주므로
 * 그 그룹은 지도에서 그냥 빠진다(실패가 아니다).
 *
 * `draft` 그룹은 부르지 않는다. 시작하지 않은 그룹에는 목표를 만들 수 없어서
 * (`group_not_active`) 항상 null이고, 다섯 번의 왕복이 확정적으로 헛돈다.
 */
export function useGroupGoals(groups: MyGroup[] | undefined) {
  return useQueries({
    queries: (groups ?? [])
      .filter((group) => group.status === 'active')
      .map((group) => ({
        queryKey: queryKeys.groupGoal(group.id),
        queryFn: () => fetchCurrentGoal(group.id),
      })),
    combine: (results) => ({
      /** group_id → 살아 있는 목표. */
      byGroupId: new Map(
        results
          .map((result) => result.data)
          .filter((data): data is GoalSnapshot => Boolean(data))
          .map((data) => [data.goal.group_id, data])
      ),
      isPending: results.some((result) => result.isPending),
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}

/**
 * 목표를 만들고 지우고 적는 것 전부.
 *
 * 성공하면 그룹 접두사 하나로 비운다. 목표는 그룹 하나에 매여 있고, 캐시 키도
 * `['groups', id, 'goal']`이라 접두사가 그대로 맞는다.
 */
export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      groupId: string;
      title: string;
      targetAmount: number;
      unit: string;
      durationDays: DurationDays;
    }) => createGoal(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}

export function useRecordGoalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { goalId: string; amount: number; note?: string }) =>
      recordGoalEntry(input.goalId, input.amount, input.note),
    // 서버가 방금 만든 스냅샷을 그대로 돌려주므로 그것으로 갈아 끼운다. 다시
    // 부르면 같은 값을 받으려고 한 번 더 다녀오게 된다.
    onSuccess: (snapshot) =>
      queryClient.setQueryData(queryKeys.groupGoal(snapshot.goal.group_id), snapshot),
  });
}

export function useDeleteGoalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => deleteGoalEntry(goalId),
    onSuccess: (snapshot) =>
      queryClient.setQueryData(queryKeys.groupGoal(snapshot.goal.group_id), snapshot),
  });
}

export function useCancelGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => cancelGoal(goalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}
