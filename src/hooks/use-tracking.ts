import { useSyncExternalStore } from 'react';

import {
  getTrackingSnapshot,
  notifyTrackingChanged,
  subscribeTracking,
  type TrackingState,
} from '@/lib/tracking';

/**
 * 이 기기의 권한·선택 상태.
 *
 * React가 소유하지 않는 값이므로 상태로 복사하지 않고 외부 저장소로 읽는다 —
 * 시스템 설정에서 권한이 꺼질 수도 있고, iOS는 시작 직후 늦게 실린 권한 상태를
 * 뒤늦게 알려준다. 구독·읽기·통지의 사연은 `lib/tracking.ts`에 적혀 있다.
 *
 * `refresh`는 앱 안에서 권한을 요청하거나 대상을 고른 **직후에** 부른다.
 * 그 변화는 네이티브가 이벤트로 알려주지 않는 것이 있어서, 우리가 통지해야 한다.
 */
export function useTrackingState(groupId: string | undefined): TrackingState & {
  refresh: () => void;
} {
  const state = useSyncExternalStore(subscribeTracking, () => getTrackingSnapshot(groupId));

  return { ...state, refresh: notifyTrackingChanged };
}
