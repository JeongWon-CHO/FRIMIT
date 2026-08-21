import type { RecentDay } from '@/lib/history';

/**
 * 최근 며칠을 화면이 그리는 모양으로.
 *
 * 네트워크가 없어서 실기기 없이 테스트된다. 여기서 정하는 것은 셈의 규칙 둘이다 —
 * **오늘은 평균에 넣지 않는다**는 것과 **그룹이 시작하기 전날은 세지 않는다**는 것.
 */

export type DayBar = {
  dateKey: string;
  /** `"월"` — 요일 한 글자. 날짜 대신 요일을 쓰는 이유는 이레치가 한눈에 들어와야 하기 때문이다. */
  label: string;
  /** 0..1. 한도를 넘긴 날도 1에서 멈춘다 — 넘긴 정도는 색이 말한다. */
  ratio: number;
  over: boolean;
  /** 아직 끝나지 않은 하루. 마지막 칸이다. */
  today: boolean;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toBars(days: RecentDay[]): DayBar[] {
  return days.map((day, index) => {
    const ratio = day.limit_seconds > 0 ? day.total_seconds / day.limit_seconds : 0;

    return {
      dateKey: day.date_key,
      // date_key는 Frimit 일자라 그대로 요일을 뽑아도 된다. 정오로 읽어 시간대에
      // 따라 하루가 밀리는 것을 막는다.
      label: WEEKDAYS[new Date(`${day.date_key}T12:00:00Z`).getUTCDay()],
      ratio: Math.max(0, Math.min(1, ratio)),
      over: day.total_seconds > day.limit_seconds && day.limit_seconds > 0,
      today: index === days.length - 1,
    };
  });
}

/**
 * 내 하루 평균.
 *
 * **오늘은 빼고 센다.** 아직 끝나지 않은 하루를 평균에 넣으면 아침에는 평균이
 * 낮았다가 저녁이 되며 올라간다 — 같은 숫자가 하루 종일 움직이면 그건 평균이 아니다.
 *
 * 그룹이 시작하기 전날도 뺀다. 그날은 아무도 집계되지 않아서 0인 것이지 적게
 * 쓴 것이 아니다.
 */
export function weeklyAverage(days: RecentDay[], startedAt?: string | null): number {
  const counted = completedDays(days, startedAt);
  if (counted.length === 0) return 0;

  const total = counted.reduce((sum, day) => sum + day.my_seconds, 0);
  return Math.round(total / counted.length);
}

/**
 * 한도를 넘기지 않은 연속 일수.
 *
 * 오늘부터 세지 않는다. 오늘은 아직 넘길 수 있는 하루라, 세어 두면 저녁에 한 번
 * 넘기는 순간 기록이 사라진다. 어제부터 거슬러 올라간다.
 */
export function underLimitStreak(days: RecentDay[], startedAt?: string | null): number {
  const counted = completedDays(days, startedAt);

  let streak = 0;
  for (let index = counted.length - 1; index >= 0; index -= 1) {
    const day = counted[index];
    if (day.limit_seconds <= 0 || day.total_seconds > day.limit_seconds) break;
    streak += 1;
  }

  return streak;
}

/**
 * 셈에 넣어도 되는 날 — 이미 끝났고, 그룹이 돌아가고 있던 날.
 *
 * 시작 시각은 그룹이 알고 있으므로 서버에 다시 묻지 않는다.
 */
function completedDays(days: RecentDay[], startedAt?: string | null): RecentDay[] {
  const started = startedAt ? new Date(startedAt).getTime() : null;

  return days.slice(0, -1).filter((day) => {
    if (started === null) return false;
    // 그룹이 하루 중간에 시작했으면 그날은 온전한 하루가 아니지만, 그날의 공동
    // 풀은 한도 전체를 받는다(plan.md 34행). 그래서 구간이 시작 시각을 품고만
    // 있으면 센다.
    return new Date(day.period_start).getTime() + 86_400_000 > started;
  });
}
