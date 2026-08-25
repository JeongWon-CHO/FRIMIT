import { rpcError, supabase } from './supabase';

/**
 * 콕 찌르기.
 *
 * 상한(30분 쿨다운, 상대별 하루 10회)은 전부 서버에 있다. 화면에서 버튼을 잠그는
 * 것으로는 지킬 수 없고 — 기기 두 대에서 동시에 누르면 그만이다 — 그래서 여기서는
 * 미리 세지 않고 거절을 그대로 받는다.
 */

export type NudgeResult = {
  /** 오늘 이 친구에게 남은 횟수. */
  remaining_today: number;
  /** 다음으로 찌를 수 있는 시각. */
  next_allowed_at: string;
};

export async function sendNudge(groupId: string, profileId: string): Promise<NudgeResult> {
  const { data, error } = await supabase.rpc('send_nudge', {
    target_group_id: groupId,
    target_profile_id: profileId,
  });

  // 서버 거절은 그대로 올린다. "방금 찔렀어요"처럼 이미 사용자에게 하는 말이라
  // 앞에 뭘 더 붙이면 같은 얘기를 두 번 하게 된다. 대신 hint가 없는 오류(네트워크
  // 따위)는 영어로 오므로, 그 판단은 rpcError에 맡긴다.
  if (error) throw rpcError(error, '콕 찌르지 못했습니다');
  return data as NudgeResult;
}
