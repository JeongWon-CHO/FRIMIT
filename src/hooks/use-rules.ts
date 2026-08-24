import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query';
import {
  fetchCurrentProposal,
  proposeDailyLimit,
  respondToProposal,
  updateDraftDailyLimit,
  withdrawProposal,
  type RuleProposalSnapshot,
} from '@/lib/rules';

/**
 * 이 그룹의 규칙 변경안 하나.
 *
 * `staleTime`을 두지 않는다. 다른 사람이 동의하면 이 화면의 "1명 남음"이 바뀌어야
 * 하고, 조회 자체가 만료 판정을 겸한다(`current_rule_proposal`은 volatile이다).
 * 48시간짜리 창을 잠긴 캐시로 보고 있으면 이미 끝난 변경안에 동의를 누르게 된다.
 */
export function useCurrentProposal(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.groupProposal(groupId ?? 'none'),
    queryFn: () => fetchCurrentProposal(groupId as string),
    enabled: Boolean(groupId),
    staleTime: 0,
  });
}

/**
 * 변경안을 건드리는 모든 뮤테이션이 같은 뒷정리를 한다.
 *
 * 응답 결과를 캐시에 바로 넣는다 — 서버가 판정까지 끝낸 스냅샷을 돌려주므로
 * 다시 물을 이유가 없다. 그룹 접두사도 비운다: 마지막 한 명이 동의하는 순간
 * 새 규칙 버전이 예약되고 활동 내역에 줄이 하나 생긴다.
 */
function useProposalMutation<TInput>(
  mutationFn: (input: TInput) => Promise<RuleProposalSnapshot>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(queryKeys.groupProposal(snapshot.proposal.group_id), snapshot);
      queryClient.invalidateQueries({ queryKey: queryKeys.allGroups });
    },
  });
}

export function useProposeDailyLimit() {
  return useProposalMutation((input: { groupId: string; dailyLimitSeconds: number }) =>
    proposeDailyLimit(input.groupId, input.dailyLimitSeconds)
  );
}

export function useRespondToProposal() {
  return useProposalMutation((input: { proposalId: string; approve: boolean }) =>
    respondToProposal(input.proposalId, input.approve)
  );
}

export function useWithdrawProposal() {
  return useProposalMutation((input: { proposalId: string }) => withdrawProposal(input.proposalId));
}

/** 시작 전 그룹은 동의 절차가 없다. 바꾸는 즉시 반영이라 그룹 캐시만 비운다. */
export function useUpdateDraftDailyLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { groupId: string; dailyLimitSeconds: number }) =>
      updateDraftDailyLimit(input.groupId, input.dailyLimitSeconds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });
}
