import type { ActivityKind } from '@/lib/activity-kinds';
import { rpcError, supabase } from '@/lib/supabase';

/**
 * 활동 내역을 읽는 창구.
 *
 * RPC가 없다. 서버가 만드는 것은 사건 행뿐이고(트리거), 읽기는 RLS가 이미
 * "내가 속한 그룹의 사건"으로 좁혀 준다. 그룹 이름과 사람 이름은 PostgREST의
 * 임베드로 함께 가져온다 — `listGroupMembers`가 프로필을 붙여 오는 방식과 같다.
 */

export type { ActivityKind };

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
  sender_nickname?: string;
  recipient_nickname?: string;
  recipient_id?: string;
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
  /** 사건에 붙은 반응들. 사람당 하나다. */
  reactions: { emoji: string; profile_id: string }[];
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
      'id, group_id, actor_id, kind, payload, created_at, groups(name, color_key), ' +
        // 사건에 사람이 둘이라(한 사람은 한 일, 한 사람은 받는 이) 표 이름만으로는
        // 어느 관계인지 말할 수 없다. 외래키 이름으로 지목한다.
        'profiles!activity_events_actor_id_fkey(nickname, avatar_key), reactions(emoji, profile_id)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw rpcError(error, '활동 내역을 읽지 못했습니다');

  type Row = Omit<ActivityEvent, 'group' | 'actor' | 'reactions'> & {
    groups: { name: string; color_key: string } | null;
    profiles: { nickname: string; avatar_key: string } | null;
    reactions: { emoji: string; profile_id: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map(({ groups, profiles, reactions, ...event }) => ({
    ...event,
    group: groups,
    actor: profiles,
    reactions: reactions ?? [],
  }));
}

/**
 * 반응을 달거나 바꾸거나 지운다.
 *
 * 서버가 토글까지 판단한다 — 같은 이모지를 다시 보내면 지워진다. 클라이언트가
 * "지금 내 반응이 무엇인지" 보고 분기하면, 두 기기에서 누를 때 서로 다른 답을 낸다.
 */
export async function reactToEvent(eventId: string, emoji: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('react_to_event', {
    target_event_id: eventId,
    reaction_emoji: emoji,
  });

  if (error) throw rpcError(error, '반응하지 못했습니다');
  return (data as { emoji: string | null }).emoji;
}
