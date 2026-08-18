import type { PoolState } from '@/lib/pool-state';
import type { PoolView } from '@/lib/today';

/**
 * 오늘 화면의 여덟 상태를 눈으로 도는 장치 — 개발 전용.
 *
 * 상태 스펙의 요구는 "레이아웃이 여덟 상태에서 동일할 것"이고, 그건 실제로
 * 여덟 장을 나란히 봐야만 확인된다. 실데이터로는 90% 상태를 만들려고 아홉
 * 시간을 쓸 수 없다. 시뮬레이터에서는 딥링크가 확인창에 막히므로 토글 버튼도
 * 소용이 없어서, 이 상수를 한 줄 고치는 것이 유일하게 빠른 길이다.
 *
 * `null`이면 실제 데이터를 쓴다. `__DEV__` 밖에서는 무시된다.
 */
export const DEV_POOL_STATE: PoolState | null = 'normal';

/** 동기화 지연 겹(G 상태)을 함께 얹어 본다. */
export const DEV_STALE = false;

const SEATS = [
  { id: 'me-정원', name: '정원', emoji: '🐣', ring: 'activity' as const },
  { id: 'minji', name: '민지', emoji: '🦊' },
  { id: 'dohyung', name: '도형', emoji: '🐧' },
  { id: 'sumin', name: '수민', emoji: '🐢' },
];

/** 상태별로 그럴듯한 숫자 하나씩. 값 자체가 아니라 빛과 배치를 보기 위한 것이다. */
const USED_RATIO: Record<PoolState, number> = {
  fresh: 0,
  normal: 0.54,
  tightening: 0.75,
  approaching: 0.9,
  complete: 1,
  over: 1.0875,
  permissionOff: 0,
};

export function devPoolView(state: PoolState): PoolView {
  const limit = 28800;
  const used = Math.round(limit * USED_RATIO[state]);
  const over = Math.max(0, used - limit);
  const remaining = Math.max(0, limit - used);
  const stale = DEV_STALE && state !== 'fresh' && state !== 'permissionOff';

  return {
    groupId: 'dev',
    groupName: '밤샘 금지단',
    accent: 'violet',
    state,
    stale,
    progress: Math.min(1, used / limit),
    limitSeconds: limit,
    usedSeconds: used,
    overSeconds: over,
    headline: over > 0 ? `${Math.round(over / 60)}m over` : formatDev(remaining),
    sublabel:
      state === 'complete' ? '8h shared, all used' : 'of 8h shared today',
    percentLabel:
      state === 'permissionOff'
        ? 'NO DATA'
        : `${stale ? '~' : ''}${Math.round((used / limit) * 100)}% USED`,
    syncLabel: 'Updated 2m ago',
    seats: SEATS,
    highlight: used > 0 ? { name: '민지', label: '1h 04m' } : null,
    staleMembers: stale
      ? [{ id: 'minji', name: '민지', emoji: '🦊', syncLabel: 'synced 38m ago' }]
      : [],
    ranking: [],
  };
}

function formatDev(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}
