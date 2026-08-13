/**
 * Frimit 일자 경계 계산.
 *
 * Frimit의 하루는 자정이 아니라 **그룹 시간대의 오전 6시**에 시작한다. 가입·탈퇴,
 * 추적 대상 변경, 규칙 변경, 목표 시작이 전부 이 경계에 걸리기 때문에, 여기서
 * 한 번 틀리면 제품 전체가 조용히 틀어진다.
 *
 * 외부 날짜 라이브러리 없이 `Intl`만으로 계산한다. 한국은 서머타임이 없지만,
 * 사용자가 여행 중이거나 그룹 시간대가 다를 수 있으므로 DST가 있는 시간대에서도
 * 맞도록 오프셋을 두 번 재는 방식을 쓴다.
 */

export const DEFAULT_TIME_ZONE = 'Asia/Seoul';
export const DEFAULT_RESET_HOUR = 6;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** 어떤 순간을 특정 시간대의 벽시계 값으로 쪼갠다. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    // 환경에 따라 자정을 '24'로 주는 경우가 있어 정규화한다.
    hour: Number(lookup.hour) % 24,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

/** 해당 순간에 그 시간대가 UTC로부터 얼마나 떨어져 있는지 (ms). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asIfUtc - instant.getTime();
}

/**
 * 특정 시간대의 벽시계 시각을 실제 순간으로 바꾼다.
 *
 * 오프셋을 두 번 재는 이유: 첫 계산은 "그 벽시계 시각이 UTC였다면"의 오프셋을
 * 쓰는데, DST 전환 근처에서는 그 값이 틀릴 수 있다. 후보 순간에서 오프셋을 다시
 * 재어 보정한다.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstGuess = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  return new Date(naive - zoneOffsetMs(firstGuess, timeZone));
}

/**
 * `instant`가 속한 Frimit 일자의 시작(= 직전 오전 6시)을 돌려준다.
 *
 * 새벽 3시는 "어제"에 속한다 — 아직 오전 6시를 지나지 않았기 때문이다.
 */
export function periodStartFor(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  resetHour: number = DEFAULT_RESET_HOUR
): Date {
  const local = zonedParts(instant, timeZone);

  let { year, month, day } = local;
  if (local.hour < resetHour) {
    // 아직 경계를 넘지 않았으므로 어제의 오전 6시가 시작점이다.
    const previous = new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000);
    year = previous.getUTCFullYear();
    month = previous.getUTCMonth() + 1;
    day = previous.getUTCDate();
  }

  return zonedTimeToInstant(year, month, day, resetHour, 0, timeZone);
}

/** 다음 경계. 규칙 변경·가입·탈퇴가 실제로 적용되는 시각이다. */
export function nextPeriodStartFor(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  resetHour: number = DEFAULT_RESET_HOUR
): Date {
  const current = periodStartFor(instant, timeZone, resetHour);
  const local = zonedParts(current, timeZone);
  const nextDay = new Date(
    Date.UTC(local.year, local.month - 1, local.day) + 24 * 60 * 60 * 1000
  );

  return zonedTimeToInstant(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    resetHour,
    0,
    timeZone
  );
}

/**
 * Frimit 일자 라벨. 사용자에게 "8월 13일" 처럼 보여줄 때 쓴다.
 * 오전 3시에도 전날 날짜가 나오는 것이 의도된 동작이다.
 */
export function frimitDateKey(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  resetHour: number = DEFAULT_RESET_HOUR
): string {
  const start = periodStartFor(instant, timeZone, resetHour);
  const local = zonedParts(start, timeZone);
  const month = String(local.month).padStart(2, '0');
  const day = String(local.day).padStart(2, '0');
  return `${local.year}-${month}-${day}`;
}
