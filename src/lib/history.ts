import { rpcError, supabase } from './supabase';

/**
 * 최근 며칠의 공동 풀.
 *
 * 서버 함수 하나가 그룹 상세의 막대와 MY 탭의 두 숫자를 모두 먹인다(0014).
 * 화면마다 따로 세면 같은 주에 대해 다른 값이 나오고, 사용자는 어느 쪽이 맞는지
 * 알 방법이 없다.
 */

export type RecentDay = {
  /** Frimit 일자 라벨. 자정이 아니라 오전 6시로 잘린 날짜다. */
  date_key: string;
  period_start: string;
  total_seconds: number;
  /** 그날 유효했던 한도. 지금 한도가 아니다. */
  limit_seconds: number;
  my_seconds: number;
};

export async function fetchRecentDays(groupId: string, days = 7): Promise<RecentDay[]> {
  const { data, error } = await supabase.rpc('group_recent_days', {
    target_group_id: groupId,
    day_count: days,
  });

  if (error) throw rpcError(error, '최근 기록을 읽지 못했습니다');
  return (data ?? []) as RecentDay[];
}
