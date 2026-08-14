import { supabase } from './supabase';

/**
 * 그룹 RPC의 클라이언트 쪽 창구.
 *
 * 네이티브 모듈이 그룹별로 사용량을 나눠 재는 키(`groupId`)는 **서버 그룹의
 * UUID 그대로**다. 로컬에서 만든 임의의 문자열을 쓰면 기기 안에서는 잘 돌아가는
 * 것처럼 보이다가 업로드 단계에서 전부 거절된다. 두 세계가 같은 식별자를 쓰게
 * 하는 것이 이 파일의 존재 이유다.
 */

export type GroupSnapshot = {
  group: {
    id: string;
    name: string;
    icon_key: string;
    color_key: string;
    status: 'draft' | 'active' | 'archived';
    invite_code: string;
    time_zone: string;
    admin_id: string;
    started_at: string | null;
    archived_at: string | null;
    created_at: string;
  };
  membership: {
    role: 'admin' | 'member';
    is_ready: boolean;
    effective_from: string | null;
    effective_until: string | null;
    joined_at: string;
  } | null;
  rule: {
    daily_limit_seconds: number;
    reset_hour: number;
    time_zone: string;
    version: number;
    effective_from: string;
  } | null;
  member_count: number;
  active_member_count: number;
  next_period_start: string;
};

export type MyGroup = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  invite_code: string;
};

/** 내가 속한 그룹. RLS가 알아서 내 것만 준다. */
export async function listMyGroups(): Promise<MyGroup[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, status, invite_code')
    .neq('status', 'archived')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`그룹 목록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as MyGroup[];
}

export async function createGroup(name: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('create_group', { group_name: name });
  if (error) throw new Error(`그룹을 만들지 못했습니다: ${error.message}`);
  return data as GroupSnapshot;
}

export async function joinGroup(inviteCode: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('join_group', {
    target_invite_code: inviteCode,
  });
  if (error) throw new Error(`그룹에 참여하지 못했습니다: ${error.message}`);
  return data as GroupSnapshot;
}

export async function startGroup(groupId: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('start_group', { target_group_id: groupId });
  if (error) throw new Error(`그룹을 시작하지 못했습니다: ${error.message}`);
  return data as GroupSnapshot;
}

/**
 * 준비 상태를 켜고 끈다.
 *
 * 이것만 RPC가 아니라 테이블 UPDATE다. 서버가 authenticated에게 열어 준 유일한
 * 집계 관련 컬럼이기 때문이다(다른 컬럼은 전부 RPC를 거쳐야 한다).
 */
export async function setReady(groupId: string, isReady: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const profileId = session.session?.user.id;
  if (!profileId) throw new Error('로그인 세션이 없습니다.');

  const { error } = await supabase
    .from('group_memberships')
    .update({ is_ready: isReady })
    .eq('group_id', groupId)
    .eq('profile_id', profileId);

  if (error) throw new Error(`준비 상태를 바꾸지 못했습니다: ${error.message}`);
}

/**
 * 스파이크 화면이 쓸 그룹 하나를 보장한다.
 *
 * 이미 속한 그룹이 있으면 그것을, 없으면 새로 만든다. 실기기 검증을 시작할 때
 * 사람이 손으로 준비할 것을 없애기 위한 편의 함수다.
 */
export async function ensureGroup(name: string): Promise<MyGroup> {
  const existing = await listMyGroups();
  if (existing.length > 0) return existing[0];

  const created = await createGroup(name);
  return {
    id: created.group.id,
    name: created.group.name,
    status: created.group.status,
    invite_code: created.group.invite_code,
  };
}
