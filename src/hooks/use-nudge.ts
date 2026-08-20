import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sendNudge } from '@/lib/nudges';
import { queryKeys } from '@/lib/query';

/**
 * 콕 찌르기 한 번.
 *
 * 성공하면 활동 내역을 다시 읽는다 — 찌른 것도 사건으로 남고(0011), 보낸 사람의
 * 피드에도 바로 보여야 "갔다"는 것을 안다. 받는 사람에게는 푸시로 간다.
 */
export function useNudge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { groupId: string; profileId: string }) =>
      sendNudge(input.groupId, input.profileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  });
}
