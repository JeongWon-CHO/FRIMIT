import { useQuery } from '@tanstack/react-query';

import { fetchRecentDays } from '@/lib/history';
import { queryKeys } from '@/lib/query';

/**
 * 최근 며칠. 그룹 상세의 막대와 MY 탭의 두 숫자가 같은 쿼리를 쓴다.
 *
 * 캐시 키가 `['groups', id, ...]` 아래에 있어서 동기화 직후의 일괄 무효화에 함께
 * 걸린다 — 오늘 칸은 지금 이 순간에도 자라는 값이다.
 */
export function useRecentDays(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.groupHistory(groupId ?? 'none'),
    queryFn: () => fetchRecentDays(groupId as string),
    enabled: Boolean(groupId),
  });
}
