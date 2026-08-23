import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query';

import {
  countReady,
  createGroup,
  joinGroup,
  leaveGroup,
  listGroupMembers,
  listMyGroups,
  listMyMemberships,
  setMuted,
  setReady,
  startGroup,
  toMyGroup,
  transferAdmin,
  type GroupMember,
  type MyGroup,
} from '@/lib/groups';
import { queryKeys } from '@/lib/query';
import { fetchGroupDailyUsage, type GroupDailyUsage } from '@/lib/usage-sync';

/** 내가 속한 그룹 목록. 보관된 그룹은 서버 쪽에서 이미 빠져 있다. */
export function useMyGroups() {
  return useQuery({
    queryKey: queryKeys.myGroups,
    queryFn: listMyGroups,
  });
}

/**
 * 그룹별 공동 풀 상태를 한꺼번에 읽는다.
 *
 * 그룹마다 별개의 쿼리로 두는 이유: 한 그룹의 왕복이 실패해도 나머지 카드는
 * 그대로 보여야 하고, 카드 하나를 새로 고칠 때 다섯 개를 다 다시 부를 이유도 없다.
 *
 * `draft` 그룹도 부른다. 서버는 시작 전 그룹에 대해 "집계 대상 0명"으로 답하므로
 * (`period_member_ids`) 한도와 다음 초기화 시각은 정상적으로 나온다. 그 그룹이
 * 아직 집계 중이 아니라는 사실은 `groups.status`가 말해 준다 — 사용량 쪽의
 * 0을 그 신호로 쓰면 "아무도 안 쓴 날"과 구분되지 않는다.
 */
export function useGroupUsages(groups: MyGroup[] | undefined) {
  return useQueries({
    queries: (groups ?? []).map((group) => ({
      queryKey: queryKeys.groupUsage(group.id),
      queryFn: () => fetchGroupDailyUsage(group.id),
    })),
    combine: (results) => ({
      /** group_id → 공동 풀 상태. 카드가 자기 것만 찾아 쓴다. */
      byGroupId: new Map(
        results
          .map((result) => result.data)
          .filter((data): data is GroupDailyUsage => Boolean(data))
          .map((data) => [data.group_id, data])
      ),
      isLoading: results.some((result) => result.isLoading),
      isFetching: results.some((result) => result.isFetching),
      /** 하나라도 실패했으면 첫 사유만 올린다. 다섯 개를 나열해 봐야 원인은 대개 하나다. */
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}

/** 내 멤버십의 개인 설정(지금은 음소거 하나). 그룹 목록과 따로 읽는다. */
export function useMyMemberships() {
  return useQuery({
    queryKey: queryKeys.myMemberships,
    queryFn: listMyMemberships,
  });
}

export function useSetMuted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { groupId: string; muted: boolean }) =>
      setMuted(input.groupId, input.muted),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships }),
  });
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.groupMembers(groupId ?? 'none'),
    queryFn: () => listGroupMembers(groupId as string),
    enabled: Boolean(groupId),
  });
}

/** 준비된 인원. 그룹 시작 조건(2명)을 화면이 다시 계산하지 않게 여기서 센다. */
export function readyCount(members: GroupMember[] | undefined): number {
  return members ? countReady(members) : 0;
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      colorKey?: string;
      dailyLimitSeconds?: number;
    }) => toMyGroup(await createGroup(input.name, input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteCode: string) => toMyGroup(await joinGroup(inviteCode)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}

/**
 * 그룹에서 나간다.
 *
 * **여기서 캐시를 비우지 않는다.** 다른 변경들과 다른 점이다 — 나간 그룹을
 * 그리고 있던 화면이 아직 화면 위에 있기 때문이다. 목록이 먼저 비면 그 화면이
 * "그룹을 찾을 수 없음" 꼴로 한 번 다시 그려지고, 사용자는 떠나는 길에 낯선
 * 화면이 번쩍이는 것을 본다.
 *
 * 순서는 부르는 쪽이 지킨다: 나가기 → 화면 정리 → 캐시 비우기
 * (`useLeaveGroupPrompt`).
 */
export function useLeaveGroup() {
  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(groupId),
  });
}

export function useTransferAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { groupId: string; newAdminId: string }) =>
      transferAdmin(input.groupId, input.newAdminId),
    // 역할은 그룹 스냅샷과 멤버 목록 양쪽에 박혀 있다. 접두사째 비운다.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}

export function useSetReady(groupId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (isReady: boolean) => setReady(groupId as string, isReady),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}

export function useStartGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => startGroup(groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}
