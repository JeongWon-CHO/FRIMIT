import { QueryClient } from '@tanstack/react-query';

/**
 * 서버 상태 캐시 하나. 앱 전체가 이것만 쓴다.
 *
 * 기본 `staleTime`을 0이 아닌 값으로 둔 이유: 오늘 화면은 그룹마다 한 번씩
 * `group_daily_usage`를 부르고(최대 5개), 탭을 옮길 때마다 다시 마운트된다.
 * 0이면 탭을 왕복할 때마다 다섯 번의 왕복이 새로 나간다. 값이 그렇게 빨리
 * 바뀌지도 않는다 — iOS의 누적값은 임계값 사다리가 만드는 계단이라 분 단위로만
 * 움직인다(docs/spike-protocol.md).
 *
 * 그래도 "지금 눈앞의 값"이 필요한 순간이 있다. 앱이 앞으로 나올 때가 그렇고,
 * 그때는 동기화가 끝난 뒤 명시적으로 무효화한다(`useUsageSync`).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      // 네트워크가 끊긴 지하철에서 다섯 번씩 재시도하며 화면을 붙잡아 두지 않는다.
      retry: 1,
      retryDelay: 1_000,
    },
  },
});

export const queryKeys = {
  profile: ['profile'] as const,
  myGroups: ['groups', 'mine'] as const,
  groupMembers: (groupId: string) => ['groups', groupId, 'members'] as const,
  groupUsage: (groupId: string) => ['groups', groupId, 'usage'] as const,
  /** 사용량 관련 전부. 동기화 직후 이 접두사로 한 번에 무효화한다. */
  allGroups: ['groups'] as const,
};
