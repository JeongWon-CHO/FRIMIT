/**
 * 공동 풀이 지금 어느 상태인가.
 *
 * 오늘 화면은 여덟 가지 모습을 갖지만 **레이아웃은 하나**다. 바뀌는 것은 빛뿐이다 —
 * 블룸의 색과 위치, 게이지의 그라데이션, 알약의 톤, 숫자, 질감의 밀도
 * (TODAY_STATE_SPEC). 그래서 임계값이 두 곳에 생기면 안 된다. 화면이 직접
 * `used > 0.9` 같은 것을 세기 시작하면 상태 하나를 고칠 때 나머지 일곱이 어긋난다.
 */

import { colors, gradients, opacity } from '@/constants/design-tokens';

export type PoolState =
  | 'fresh'
  | 'normal'
  | 'tightening'
  | 'approaching'
  | 'complete'
  | 'over'
  | 'permissionOff';

/** 한 명이라도 이만큼 늦으면 동기화 이슈로 본다. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export function poolState(
  used: number,
  over: number,
  options: { permission: boolean }
): PoolState {
  // 권한이 없으면 애초에 우리 숫자가 아니다. 다른 어떤 판단보다 먼저다.
  if (!options.permission) return 'permissionOff';
  if (over > 0) return 'over';
  if (used >= 1) return 'complete';
  if (used >= 0.88) return 'approaching';
  if (used >= 0.7) return 'tightening';
  if (used < 0.05) return 'fresh';
  return 'normal';
}

/** 동기화 이슈(G)는 상태가 아니라 **B~F 위에 얹히는 겹**이다. */
export function hasStaleSync(
  lastCollectedAt: (string | null)[],
  now: Date = new Date(),
  state?: PoolState
): boolean {
  if (state === 'fresh' || state === 'permissionOff') return false;

  return lastCollectedAt.some(
    (iso) => iso !== null && now.getTime() - new Date(iso).getTime() > STALE_AFTER_MS
  );
}

type StateVisual = {
  /** 게이지 아크 */
  arc: readonly string[];
  /** 히어로 카드 위의 블룸 */
  heroBloom: { color: string; opacity: number; size: number; y: number };
  /** 화면 단위 블룸. 없는 상태도 있다. */
  ambient: { color: string; opacity: number; size: number } | null;
  /** 퍼센트 칩의 글자색 */
  chip: string;
  /** 배경 질감. 한도 도달과 권한 꺼짐만 차분한 쪽으로 바뀐다. */
  texture: 'screen' | 'calm';
  /** 숫자가 흰색이 아닌 유일한 상태가 초과다. */
  numberTone: 'primary' | 'over';
};

/**
 * 상태 → 빛. 여기 없는 값을 화면이 직접 정하면 안 된다.
 *
 * 초과를 빨강으로 칠하지 않고 배경도 물들이지 않는다. 한도를 넘겨도 차단하지
 * 않고 비난하지도 않는 제품이라, 경고음이 아니라 사실 통보여야 한다.
 */
export const POOL_VISUALS: Record<PoolState, StateVisual> = {
  fresh: {
    arc: [colors.accent.cyan, colors.accent.cyan],
    heroBloom: { color: colors.accent.cyan, opacity: 0.4, size: 230, y: 0 },
    ambient: { color: colors.accent.cyan, opacity: 0.24, size: 400 },
    chip: colors.accent.cyanSoft,
    texture: 'screen',
    numberTone: 'primary',
  },
  normal: {
    arc: gradients.sharedPool.colors,
    heroBloom: { color: colors.accent.violet, opacity: opacity.bloomHero, size: 300, y: 0 },
    ambient: { color: colors.accent.violet, opacity: 0.32, size: 400 },
    chip: colors.accent.cyan,
    texture: 'screen',
    numberTone: 'primary',
  },
  tightening: {
    arc: gradients.tightening.colors,
    // 블룸이 커지면서 위로 올라간다 — 방이 더 보라색이 될 뿐, 경고는 없다.
    heroBloom: { color: '#8B5CF6', opacity: 0.62, size: 320, y: -90 },
    ambient: { color: colors.accent.violet, opacity: 0.32, size: 400 },
    chip: colors.accent.violetPale,
    texture: 'screen',
    numberTone: 'primary',
  },
  approaching: {
    arc: gradients.approaching.colors,
    heroBloom: { color: '#D946EF', opacity: 0.5, size: 320, y: -70 },
    ambient: { color: '#C084FC', opacity: 0.42, size: 400 },
    chip: colors.state.approaching,
    texture: 'screen',
    numberTone: 'primary',
  },
  complete: {
    arc: [colors.accent.violet, colors.accent.blue, colors.accent.cyan, colors.accent.violet],
    // 빛이 링 아래로 내려간다. 타오르는 대신 가라앉는다.
    heroBloom: { color: colors.accent.violet, opacity: 0.4, size: 300, y: 110 },
    ambient: null,
    chip: colors.state.complete,
    texture: 'calm',
    numberTone: 'primary',
  },
  over: {
    arc: [colors.accent.violet, '#D946EF', colors.state.overLimit],
    heroBloom: { color: '#F472B6', opacity: 0.4, size: 300, y: 0 },
    ambient: { color: '#F472B6', opacity: 0.3, size: 400 },
    chip: colors.state.overLimit,
    texture: 'screen',
    numberTone: 'over',
  },
  permissionOff: {
    // 회색 트랙만. 이 화면에서 채도를 갖는 것은 CTA 버튼 하나뿐이어야 한다.
    arc: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)'],
    heroBloom: { color: 'rgba(0,0,0,0)', opacity: 0, size: 0, y: 0 },
    ambient: null,
    chip: colors.text.muted,
    texture: 'calm',
    numberTone: 'primary',
  },
};
