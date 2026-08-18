import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { queryKeys } from '@/lib/query';
import { describeSyncSummary, type UsageSyncSummary } from '@/lib/usage-payload';
import { syncUsage } from '@/lib/usage-sync';

import { useForeground } from './use-foreground';

/**
 * 기기의 누적값을 서버로 올리고, 끝나면 오늘 화면의 캐시를 무효화한다.
 *
 * **순서가 중요하다.** 올리기 전에 읽으면 화면에는 내가 방금 쓴 시간이 빠진 값이
 * 그려지고, 다른 사람 것만 최신인 상태가 된다. 공동 풀이 제품의 전부라 그건 표시
 * 문제가 아니라 규칙이 어긋나 보이는 문제다.
 *
 * 앱이 앞으로 나오는 시점이 사실상 유일하게 믿을 만한 동기화 시점이다 —
 * iOS의 계단값은 백그라운드에서 저절로 정확해지지 않는다(plan.md 184행).
 *
 * 상태를 직접 들고 있지 않고 mutation에 맡긴다. 진행 중·결과·오류를 화면마다
 * 복사해 두면 그 사본이 실제 요청과 어긋나는 순간이 생긴다.
 */
export type UsageSyncStatus = {
  isSyncing: boolean;
  /** 마지막 동기화를 사람이 읽을 한 줄. */
  lastMessage: string | null;
  lastError: string | null;
  summary: UsageSyncSummary | null;
  sync: () => Promise<void>;
};

export function useUsageSync(): UsageSyncStatus {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: syncUsage,
    // 실패해도 무효화한다. 못 올렸다는 것과 서버의 확정값이 낡았다는 것은 다른
    // 얘기이고, 화면은 후자를 계속 보여줘야 한다. 사용량이 사라지는 것도 아니다 —
    // 누적값은 단조 증가하므로 다음 동기화에서 따라온다.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.allGroups }),
  });

  /**
   * 겹침 방지. 화면 진입과 앱 복귀가 거의 동시에 걸린다. 서버가 멱등이라 값이
   * 틀어지지는 않지만 왕복이 그냥 낭비다. `isPending`을 보면 콜백이 만들어진
   * 시점의 값을 읽게 되므로 ref로 잠근다.
   */
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    try {
      await mutation.mutateAsync();
    } catch {
      // 사유는 mutation.error에 남는다. 여기서 다시 던지면 앱 복귀 때마다
      // 처리되지 않은 거절이 생긴다.
    } finally {
      running.current = false;
    }
  }, [mutation]);

  /**
   * 화면에 들어올 때 한 번.
   *
   * `sync`의 참조는 렌더마다 바뀐다 — mutation의 `mutateAsync`가 상태가 바뀔 때마다
   * 새로 만들어지기 때문이다(`{...result, mutateAsync: result.mutate}`). 그래서 이
   * effect는 의존성으로 한 번을 보장하지 못하고, 잠그지 않으면 동기화가 끝나 상태가
   * 바뀔 때마다 다시 돈다. `running` 빗장은 겹침만 막고 이 되풀이는 막지 못한다.
   */
  const startedOnce = useRef(false);

  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    sync();
  }, [sync]);

  useForeground(sync);

  return {
    isSyncing: mutation.isPending,
    lastMessage: mutation.data ? describeSyncSummary(mutation.data) : null,
    lastError: mutation.error instanceof Error ? mutation.error.message : null,
    summary: mutation.data ?? null,
    sync,
  };
}
