/**
 * Shared Orbit의 기하.
 *
 * 이 제품의 서명 그래픽이고, 하는 말은 하나다 — **여러 사람이 하나의 유한한
 * 시간을 같이 쓴다.** 그래서 각도와 반지름을 화면에서 즉석으로 계산하지 않고
 * 여기 모아 둔다. 아바타를 top/left로 하나씩 밀어 놓기 시작하면 인원이 바뀔
 * 때마다 링이 조금씩 어긋나고, 그건 눈에 띄지 않게 서서히 무너진다.
 *
 * 각도는 전부 **12시(-90°)에서 시작해 시계 방향**이다. 시계처럼 읽히는 것이
 * 의도된 연상이다(SHARED_ORBIT_SPEC §2).
 */

/**
 * 아크의 굵기.
 *
 * **비율은 지름이 아니라 바깥 반지름 기준이다** — 토큰의 `orbitStrokeRatio: 0.18`은
 * "r=81에서 약 14.6px"이라고 적혀 있다(162 * 0.18 = 29.2가 아니라 81 * 0.18 = 14.6).
 * 지름으로 계산하면 링이 두 배로 두꺼워지고, 아바타가 앉는 반지름이 73.7에서
 * 66으로 당겨져 가운데 숫자와 부딪힌다. 실기기에서 실제로 그렇게 나왔다.
 */
export function ringStroke(size: number, ratio: number): number {
  return (size / 2) * ratio;
}

/** 스트로크 중심이 놓이는 반지름. 아바타도 같은 값 위에 앉는다. */
export function ringRadius(size: number, stroke: number): number {
  return (size - stroke) / 2;
}

/** 12시에서 시작해 균등 분배. 인원별로 하드코딩하지 않는다. */
export function avatarAngles(count: number): number[] {
  return Array.from({ length: count }, (_, index) => -90 + (360 / count) * index);
}

export function avatarPosition(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

/**
 * 인원에 따른 아바타 크기(SHARED_ORBIT_SPEC §4).
 *
 * 인원이 늘면 한 단계씩 줄인다. 줄이지 않으면 6명부터 서로 겹쳐서 링이
 * 아바타 목걸이처럼 보인다.
 */
export function avatarSizeFor(count: number, variant: 'today' | 'detail' = 'today'): number {
  const table: Record<'today' | 'detail', [number, number][]> = {
    // [최대 인원, 크기]
    today: [
      [2, 34],
      [4, 32],
      [6, 28],
      [8, 26],
    ],
    detail: [
      [2, 30],
      [4, 28],
      [6, 26],
      [8, 24],
    ],
  };

  for (const [max, size] of table[variant]) {
    if (count <= max) return size;
  }
  return table[variant][table[variant].length - 1][1];
}

/**
 * 9명 이상이면 앞의 7명 + `+N` 디스크.
 *
 * 서버 정원이 8명이라 실제로는 오지 않는 경우지만, 규칙이 있으면 규칙대로 둔다 —
 * 정원이 늘어난 날 링이 조용히 겹치는 것보다 낫다.
 */
export function visibleSeats<T>(members: T[]): { shown: T[]; overflow: number } {
  if (members.length <= 8) return { shown: members, overflow: 0 };
  return { shown: members.slice(0, 7), overflow: members.length - 7 };
}

export type OrbitSegment = {
  /** 이 구간의 길이 (호 길이, 0..circumference) */
  length: number;
  /** 링 시작(12시)에서 이 구간까지의 거리 */
  offset: number;
};

/**
 * 멤버별 세그먼트를 호 길이로 환산한다 (그룹 상세).
 *
 * 구간 사이는 2°만큼 비운다. 그 틈은 색이 아니라 **없음**이다 — 카드 표면이
 * 그대로 비쳐서 세그먼트가 따로 놀지 않고 하나의 링으로 읽힌다.
 *
 * 합이 한도를 넘으면 링 한 바퀴에서 멈춘다. 초과분은 바깥의 별도 아크가 진다.
 */
export function segmentsFor(
  values: number[],
  limit: number,
  circumference: number,
  gapDegrees = 2
): OrbitSegment[] {
  if (limit <= 0) return [];

  const gap = (gapDegrees / 360) * circumference;
  const segments: OrbitSegment[] = [];
  let offset = 0;

  for (const value of values) {
    const raw = (Math.max(0, value) / limit) * circumference;
    // 남은 자리보다 길 수 없다. 넘긴 사람의 구간이 한 바퀴를 지나 처음 사람의
    // 구간 위에 겹쳐 그려지면 누가 얼마나 썼는지가 뒤집혀 보인다.
    const available = Math.max(0, circumference - offset);
    const length = Math.min(raw, available);

    segments.push({ length: Math.max(0, length - gap), offset });
    offset += length;
  }

  return segments;
}

/**
 * 초과 아크의 스윕(도).
 *
 * 한 바퀴를 더 도는 대신 60°에서 멈춘다. 세 배를 쓴 날에도 링이 두 바퀴 돌면
 * "얼마나 넘었나"가 아니라 "고장 났나"로 읽힌다.
 */
export function overshootDegrees(overSeconds: number, limitSeconds: number): number {
  if (limitSeconds <= 0 || overSeconds <= 0) return 0;
  return Math.min(60, (overSeconds / limitSeconds) * 360);
}
