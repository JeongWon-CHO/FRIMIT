import { useQuery } from '@tanstack/react-query';

import { listActivity } from '@/lib/activity';
import { queryKeys } from '@/lib/query';

/**
 * 활동 흐름 하나.
 *
 * 그룹별로 나누지 않으므로 쿼리도 하나다(`useGroupUsages`와 다른 점). 캐시 키를
 * `['groups', ...]` 아래 두는 이유는 동기화 직후의 일괄 무효화에 함께 걸리기
 * 위해서다 — 한도 도달 사건은 사용량이 올라간 바로 그 순간에 생긴다.
 */
export function useActivity() {
  return useQuery({
    queryKey: queryKeys.activity,
    queryFn: () => listActivity(),
  });
}
