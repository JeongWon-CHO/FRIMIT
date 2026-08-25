import { forgetDevice } from './device';
import { resetProgress } from './onboarding';
import { rpcError, supabase } from './supabase';

/**
 * 계정 삭제. 되돌릴 수 없다.
 *
 * 서버가 하는 일은 한 트랜잭션 안에 있다(0012) — 관리자 자동 이전, 그룹 정리,
 * 개인 자료 삭제, 프로필 익명화, 인증 정보 삭제. 여기서 할 일은 그 뒤에 남은
 * **기기 쪽 흔적**을 치우는 것뿐이다.
 *
 * 순서가 중요하다. 서버가 먼저다 — 로컬을 먼저 지우면 RPC를 부를 세션이 사라진다.
 */
export type DeleteAccountResult = {
  /** 정리한 그룹 수. */
  groups: number;
  /** 관리자를 넘긴 그룹 수. */
  transferred: number;
  /** 넘길 사람이 없어 보관된 그룹 수. */
  archived: number;
};

export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) throw rpcError(error, '계정을 지우지 못했습니다');

  /*
   * 여기부터는 실패해도 되돌릴 것이 없다. 계정은 이미 서버에서 사라졌으므로,
   * 로컬 정리가 하나 실패했다고 사용자에게 오류를 보여 주면 "지워진 건가?"라는
   * 답할 수 없는 질문만 남는다. 조용히 최선을 다한다.
   *
   * 다만 순서는 지킨다. `resetProgress()`는 온보딩 기록을 **계정별 키**로 찾고
   * (`onboarding.ts`), 그 키는 세션에서 나온다. `signOut()`과 나란히 두면 어느
   * 쪽이 먼저 끝나느냐에 따라 엉뚱한 키를 지우고 이 계정의 기록은 남는다.
   */
  await Promise.allSettled([
    resetProgress(),
    // 다음 실행이 남의 기기 행을 자기 것으로 착각하지 않게 한다.
    forgetDevice(),
  ]);
  await supabase.auth.signOut();

  return data as DeleteAccountResult;
}
