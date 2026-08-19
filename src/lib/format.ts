import { DEFAULT_TIME_ZONE } from './frimit-day';

/**
 * 시간 값을 사람이 읽는 문장으로.
 *
 * 이 파일의 규칙은 하나다: **초를 보여주지 않는다.** iOS의 누적값은 임계값 사다리가
 * 만드는 계단이라 해상도가 1분이고(docs/spike-protocol.md), 초 자리를 적으면 실제로
 * 없는 정밀도를 주장하게 된다. Android는 초까지 정확하지만, 같은 화면에서 두 사람의
 * 값이 다른 단위로 보이는 것이 더 나쁘다.
 *
 * 스파이크 화면은 예외다 — 거기서는 초가 측정값 그 자체라 자기 서식을 따로 갖고 있다.
 */

/** "1시간 12분", "8분", "0분" */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${minutes}분`;
}

/**
 * 숫자와 단위를 쪼갠 형태. 큰 글씨로 시간을 보여줄 때 단위만 작게 조판하려면
 * 문자열 하나로는 부족하다.
 */
export function splitDuration(seconds: number): { value: string; unit: string }[] {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return [
      { value: String(hours), unit: '시간' },
      { value: String(minutes), unit: '분' },
    ];
  }
  if (hours > 0) return [{ value: String(hours), unit: '시간' }];
  return [{ value: String(minutes), unit: '분' }];
}

/** "오후 3:04". 마지막 동기화 시각처럼 오늘 안의 시각에 쓴다. */
export function formatClock(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * "방금", "12분 전", "3시간 전".
 *
 * 동기화 시각은 항상 보여준다는 계약이 있다(plan.md 28행). 백그라운드 집계가
 * "실시간"을 보장하지 않으므로, 값이 낡았을 수 있다는 사실을 숨기지 않는다.
 */
export function formatSyncAge(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '아직 동기화 안 됨';

  const elapsed = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (elapsed < 60) return '방금 동기화';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}분 전 동기화`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}시간 전 동기화`;
  return `${Math.floor(elapsed / 86400)}일 전 동기화`;
}

/** "8월 17일". Frimit 일자 라벨(YYYY-MM-DD)을 사람 문장으로 옮긴다. */
export function formatDateKey(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

/**
 * 다음 경계까지 남은 시간. "6시간 12분 후 초기화"
 *
 * 경계가 자정이 아니라는 것을 사용자가 알 방법이 화면에 없으면, 밤 11시에 잔여가
 * 리셋되기를 기다리는 사람이 생긴다.
 */
export function formatUntilReset(periodEnd: string, now: Date = new Date()): string {
  const remaining = Math.max(0, Math.floor((new Date(periodEnd).getTime() - now.getTime()) / 1000));
  return `${formatDuration(remaining)} 후 초기화`;
}

/**
 * 디자인 표기의 시간 — `"3h 42m"`, `"48m"`, `"8h"`.
 *
 * 위의 한국어 서식과 나란히 두는 이유는 둘이 쓰이는 자리가 다르기 때문이다.
 * 큰 숫자와 라벨은 승인된 디자인 카피를 따르고(핸드오프: 카피는 최종),
 * 문장 안에 들어가는 시간은 한국어 서식을 그대로 쓴다. **한 화면에서 두 표기를
 * 섞지 않는 것**이 규칙이다 — 히어로가 "3h 42m"이면 그 화면의 시간은 전부 그 꼴이다.
 */
export function formatShort(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * 히어로의 큰 숫자.
 *
 * 잔여는 0에서 멈추고 초과분이 따로 오른다 — 한도를 넘겨도 차단하지 않는다는
 * 규칙이 서버 계산에 이미 들어 있고, 화면은 그 두 값을 다르게 부른다.
 */
export function formatPoolHeadline(remainingSeconds: number, overSeconds: number): string {
  if (overSeconds > 0) return `${formatShort(overSeconds)} over`;
  return formatShort(remainingSeconds);
}

/** `"54% USED"`. 늦은 멤버가 있으면 `~`가 붙는다 — 값이 더 낮을 수 있다는 뜻. */
export function formatUsedPercent(
  usedSeconds: number,
  limitSeconds: number,
  stale = false
): string {
  if (limitSeconds <= 0) return 'NO DATA';
  const percent = Math.round((usedSeconds / limitSeconds) * 100);
  return `${stale ? '~' : ''}${percent}% USED`;
}
