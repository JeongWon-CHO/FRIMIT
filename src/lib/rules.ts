import { supabase } from './supabase';

/**
 * 공동 규칙 변경 — 클라이언트 쪽 창구.
 *
 * 규칙(공동 한도·초기화 시각·시간대)은 아무도 덮어쓸 수 없다. 시작한 그룹에서는
 * **활성 멤버 전원의 동의**를 받아야 하고, 적용은 다음 오전 6시다(plan.md 36행).
 * 오늘의 공동 풀은 이미 오늘의 한도로 돌고 있어서, 한가운데서 한도가 바뀌면
 * 아침부터 아껴 쓴 사람의 계산이 무너진다.
 *
 * 그 절차는 전부 서버에 있다(0005). 여기서 하는 일은 부르는 것뿐이고, 만료
 * 판정조차 조회 RPC가 알아서 한다 — `current_rule_proposal`이 volatile인 이유다.
 *
 * 시작 전 그룹은 다르다. 지킬 공정성이 없으므로 관리자가 바로 고친다
 * (`update_draft_rule`).
 */

export type RuleDecision = 'pending' | 'approved' | 'rejected';

export type RuleProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export type RuleProposalSnapshot = {
  proposal: {
    id: string;
    group_id: string;
    proposer_id: string;
    daily_limit_seconds: number;
    reset_hour: number;
    time_zone: string;
    base_version: number;
    status: RuleProposalStatus;
    expires_at: string;
    /** 승인된 변경안이 유효해지는 시각. 그 전에는 null이다. */
    effective_from: string | null;
    resolved_at: string | null;
    created_at: string;
  };
  /** 변경안을 만들 때의 기준 규칙 — "이전 → 이후"의 왼쪽. */
  base_rule: {
    daily_limit_seconds: number;
    reset_hour: number;
    time_zone: string;
    version: number;
    effective_from: string;
  } | null;
  approvals: { profile_id: string; decision: RuleDecision; decided_at: string | null }[];
  my_decision: RuleDecision | null;
  required_count: number;
  /** 아직 답하지 않은 사람 수. 화면의 "1명 남음"이 이 값이다. */
  pending_count: number;
};

/**
 * 이 그룹의 가장 최근 변경안. 없으면 null.
 *
 * 진행 중인 것이 없으면 최근에 끝난 것을 준다 — 방금 승인된 변경안의 적용 예정
 * 시각을 계속 보여줘야 하기 때문이다. 화면은 `status`로 갈라 읽는다.
 */
export async function fetchCurrentProposal(groupId: string): Promise<RuleProposalSnapshot | null> {
  const { data, error } = await supabase.rpc('current_rule_proposal', {
    target_group_id: groupId,
  });

  if (error) throw new Error(`변경안을 읽지 못했습니다: ${error.message}`);
  return (data as RuleProposalSnapshot | null) ?? null;
}

/**
 * 공동 한도 변경을 제안한다. 제안은 곧 동의라 제안자는 따로 누르지 않는다.
 *
 * 초기화 시각과 시간대도 같은 RPC가 받지만 화면이 아직 그 둘을 고치게 하지
 * 않는다. 넘기지 않은 값은 서버가 현재 값 그대로 쓴다.
 */
export async function proposeDailyLimit(
  groupId: string,
  dailyLimitSeconds: number
): Promise<RuleProposalSnapshot> {
  const { data, error } = await supabase.rpc('propose_rule_change', {
    target_group_id: groupId,
    proposed_daily_limit_seconds: dailyLimitSeconds,
  });

  if (error) throw new Error(`변경안을 내지 못했습니다: ${error.message}`);
  return data as RuleProposalSnapshot;
}

/** 동의하거나 거절한다. 한 번 답하면 바꿀 수 없다. */
export async function respondToProposal(
  proposalId: string,
  approve: boolean
): Promise<RuleProposalSnapshot> {
  const { data, error } = await supabase.rpc('respond_to_rule_proposal', {
    target_proposal_id: proposalId,
    approve,
  });

  if (error) throw new Error(`응답하지 못했습니다: ${error.message}`);
  return data as RuleProposalSnapshot;
}

/** 진행 중인 변경안을 거둔다. 제안자 본인과 관리자만. */
export async function withdrawProposal(proposalId: string): Promise<RuleProposalSnapshot> {
  const { data, error } = await supabase.rpc('withdraw_rule_proposal', {
    target_proposal_id: proposalId,
  });

  if (error) throw new Error(`거두지 못했습니다: ${error.message}`);
  return data as RuleProposalSnapshot;
}

/** 시작 전 그룹의 한도를 관리자가 바로 고친다. 동의를 모을 이유가 없다. */
export async function updateDraftDailyLimit(
  groupId: string,
  dailyLimitSeconds: number
): Promise<void> {
  const { error } = await supabase.rpc('update_draft_rule', {
    target_group_id: groupId,
    new_daily_limit_seconds: dailyLimitSeconds,
  });

  if (error) throw new Error(`공동 시간을 바꾸지 못했습니다: ${error.message}`);
}
