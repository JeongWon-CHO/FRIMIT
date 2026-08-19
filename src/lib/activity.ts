import { supabase } from '@/lib/supabase';

/**
 * 활동 내역을 읽는 창구.
 *
 * RPC가 없다. 서버가 만드는 것은 사건 행뿐이고(트리거), 읽기는 RLS가 이미
 * "내가 속한 그룹의 사건"으로 좁혀 준다. 그룹 이름과 사람 이름은 PostgREST의
 * 임베드로 함께 가져온다 — `listGroupMembers`가 프로필을 붙여 오는 방식과 같다.
 */

export type ActivityKind =
  | 'group_started'
  | 'member_joined'
  | 'member_left'
  | 'rule_changed'
  | 'pool_threshold'
  | 'pool_over'
  | 'goal_created'
  | 'goal_entry'
  | 'goal_cleared'
  | 'goal_cancelled';

/** 서버가 담아 준 재료. 문장은 화면이 만든다(`activity-view.ts`). */
export type ActivityPayload = {
  threshold?: number;
  total_seconds?: number;
  limit_seconds?: number;
  over_seconds?: number;
  daily_limit_seconds?: number;
  effective_from?: string;
  title?: string;
  unit?: string;
  amount?: number;
  target_amount?: number;
};

export type ActivityEvent = {
  id: string;
  group_id: string;
  actor_id: string | null;
  kind: ActivityKind;
  payload: ActivityPayload;
  created_at: string;
  group: { name: string; color_key: string } | null;
  actor: { nickname: string; avatar_key: string } | null;
};

/**
 * 최근 사건들. 그룹 통합 흐름이므로 그룹으로 나누지 않는다(plan.md 78행).
 *
 * 60개에서 끊는다. 화면은 하루 단위로 묶어 보여주고, 그보다 오래된 것을 찾는
 * 사람은 아직 없다. 무한 스크롤은 그 사람이 나타나면 만든다.
 */
export async function listActivity(limit = 60): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select(
      'id, group_id, actor_id, kind, payload, created_at, groups(name, color_key), profiles(nickname, avatar_key)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`활동 내역을 읽지 못했습니다: ${error.message}`);

  type Row = Omit<ActivityEvent, 'group' | 'actor'> & {
    groups: { name: string; color_key: string } | null;
    profiles: { nickname: string; avatar_key: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map(({ groups, profiles, ...event }) => ({
    ...event,
    group: groups,
    actor: profiles,
  }));
}
