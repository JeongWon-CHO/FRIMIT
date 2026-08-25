import { rpcError, supabase } from '@/lib/supabase';

/**
 * 공동 목표 RPC의 클라이언트 쪽 창구.
 *
 * 진행률 산수는 전부 서버에 있다 — 개인 달성률을 100%에서 끊은 뒤 평균하는 그
 * 순서(plan.md 46행)를 두 곳에 두면 언젠가 갈라진다. 여기서는 부르고 받을 뿐이고,
 * 받은 것을 화면 모양으로 옮기는 일은 `goal-view.ts`가 한다(네트워크가 없어야
 * 테스트가 실기기 없이 돈다).
 */

export type GoalSnapshot = {
  goal: {
    id: string;
    group_id: string;
    title: string;
    target_amount: number;
    unit: string;
    duration_days: number;
    starts_at: string;
    ends_at: string;
    cancelled_at: string | null;
    created_by: string;
  };
  group_name: string;
  date_key: string;
  /** 시작 시각을 지났는가. 시작 전 목표는 진행률 대신 시작 시각을 보여준다. */
  started: boolean;
  /** 0..1. 개인 달성률을 100%에서 끊은 뒤 평균한 값이다. */
  group_progress: number;
  participants: {
    profile_id: string;
    nickname: string;
    avatar_key: string;
    amount: number;
    /** 0..1로 잘린 개인 달성률. */
    ratio: number;
  }[];
  /** 오늘 내가 적은 것. 있으면 입력칸이 이 값으로 차고 '기록'이 '수정'이 된다. */
  my_entry: { amount: number; note: string | null; date_key: string } | null;
};

/** 그룹의 살아 있는 목표. 없으면 null — 실패가 아니라 정상적인 빈 상태다. */
export async function fetchCurrentGoal(groupId: string): Promise<GoalSnapshot | null> {
  const { data, error } = await supabase.rpc('current_goal', { target_group_id: groupId });
  if (error) throw rpcError(error, '목표를 읽지 못했습니다');
  return (data ?? null) as GoalSnapshot | null;
}

export async function createGoal(input: {
  groupId: string;
  title: string;
  targetAmount: number;
  unit: string;
  durationDays: 7 | 14 | 30;
}): Promise<GoalSnapshot> {
  const { data, error } = await supabase.rpc('create_goal', {
    target_group_id: input.groupId,
    goal_title: input.title,
    target_amount: input.targetAmount,
    goal_unit: input.unit,
    duration_days: input.durationDays,
  });
  if (error) throw rpcError(error, '목표를 만들지 못했습니다');
  return data as GoalSnapshot;
}

/**
 * 오늘 몫을 적는다. 같은 날 다시 부르면 덮어쓴다.
 *
 * 날짜를 넘기지 않는 것이 "지난 날짜는 못 고친다"의 전부다(plan.md 49행). 서버가
 * 지금 시각으로 Frimit 일자를 정하므로 클라이언트에 지난 날을 지목할 수단이 없다.
 */
export async function recordGoalEntry(
  goalId: string,
  amount: number,
  note?: string
): Promise<GoalSnapshot> {
  const { data, error } = await supabase.rpc('record_goal_entry', {
    target_goal_id: goalId,
    entry_amount: amount,
    entry_note: note ?? null,
  });
  if (error) throw rpcError(error, '기록하지 못했습니다');
  return data as GoalSnapshot;
}

export async function deleteGoalEntry(goalId: string): Promise<GoalSnapshot> {
  const { data, error } = await supabase.rpc('delete_goal_entry', { target_goal_id: goalId });
  if (error) throw rpcError(error, '기록을 지우지 못했습니다');
  return data as GoalSnapshot;
}

export async function cancelGoal(goalId: string): Promise<GoalSnapshot> {
  const { data, error } = await supabase.rpc('cancel_goal', { target_goal_id: goalId });
  if (error) throw rpcError(error, '목표를 취소하지 못했습니다');
  return data as GoalSnapshot;
}

export const DURATION_CHOICES = [7, 14, 30] as const;
export type DurationDays = (typeof DURATION_CHOICES)[number];
