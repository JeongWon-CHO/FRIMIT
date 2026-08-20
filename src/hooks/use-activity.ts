import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listActivity, reactToEvent } from '@/lib/activity';
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

/**
 * 반응 하나.
 *
 * 서버가 토글까지 판단하므로(같은 이모지를 다시 보내면 취소) 여기서는 결과를
 * 받아 목록만 다시 읽는다. 낙관적 갱신을 넣지 않은 이유는 칩 하나가 늘고 줄 뿐이라
 * 왕복 한 번이 눈에 띄지 않기 때문이다.
 */
export function useReact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { eventId: string; emoji: string }) =>
      reactToEvent(input.eventId, input.emoji),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  });
}
