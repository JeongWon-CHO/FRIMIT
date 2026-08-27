import { ScreenTime } from '@modules/screen-time';

import { rpcError, supabase } from './supabase';

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
  icon_key: string;
  color_key: string;
  admin_id: string;
  started_at: string | null;
  time_zone: string;
};

/**
 * 초대할 때 보내는 한 줄.
 *
 * 대기실과 그룹 상세 두 곳에서 보낸다. 문장을 각자 들고 있으면 한쪽만 고치는
 * 날이 오고, 그때 틀리는 것은 **코드의 모양**이다 — 받는 쪽 입력칸은 숫자
 * 여섯 자리만 받으므로 `FRM-` 접두사가 섞여 들어가면 그대로 막힌다.
 */
export function inviteMessage(group: Pick<MyGroup, 'name' | 'invite_code'>): string {
  return `${group.name}에 초대할게요. Frimit에서 코드 ${group.invite_code}로 참여해 주세요.`;
}

/** 내가 속한 그룹. RLS가 알아서 내 것만 준다. */
export async function listMyGroups(): Promise<MyGroup[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, status, invite_code, icon_key, color_key, admin_id, started_at, time_zone')
    .neq('status', 'archived')
    .order('created_at', { ascending: true });

  if (error) throw rpcError(error, '그룹 목록을 읽지 못했습니다');

  const groups = (data ?? []) as MyGroup[];

  // 차단 화면은 네트워크를 쓸 수 없다. 잠긴 앱을 열 때마다 아주 짧게 실행되고
  // 끝나므로, "어느 그룹 때문에 막혔는지"를 말하려면 이름이 미리 기기에 있어야
  // 한다. 목록을 읽는 김에 베껴 둔다 — 이름이 바뀌어도 여기서 따라간다.
  for (const group of groups) {
    ScreenTime.setGroupLabel(group.id, group.name);
  }

  return groups;
}

export type GroupMember = {
  profile_id: string;
  role: 'admin' | 'member';
  is_ready: boolean;
  effective_from: string | null;
  effective_until: string | null;
  nickname: string;
  avatar_key: string;
};

/**
 * 그룹의 멤버들. 같은 그룹 멤버끼리는 서로의 닉네임·아바타가 보인다(0002의 RLS).
 *
 * 여기서 나오는 것은 **정원에 잡히는 사람 전부**다 — 아직 첫 오전 6시를 지나지
 * 않아 집계에는 들어가지 않는 사람도 포함된다. 시작 대기 화면에서 "누가 준비했나"를
 * 세려면 그 사람들도 보여야 하기 때문이다. 반대로 공동 풀의 분모는 서버가
 * `group_daily_usage`에서 따로 계산한다(`period_member_ids`).
 */
export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_memberships')
    .select('profile_id, role, is_ready, effective_from, effective_until, profiles(nickname, avatar_key)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  if (error) throw rpcError(error, '멤버 목록을 읽지 못했습니다');

  type Row = Omit<GroupMember, 'nickname' | 'avatar_key'> & {
    profiles: { nickname: string; avatar_key: string } | null;
  };

  // 탈퇴가 이미 반영된 사람만 걸러 낸다. 정원은 8명이라 서버에 조건을 실어
  // 보낼 이유가 없고, `effective_until.gt.<ISO>` 같은 필터는 값에 특수문자가
  // 들어가 조용히 어긋날 여지가 있다.
  const now = Date.now();

  return ((data ?? []) as unknown as Row[])
    .filter(
      (row) => row.effective_until === null || new Date(row.effective_until).getTime() > now
    )
    .map(({ profiles, ...member }) => ({
      ...member,
      // 프로필이 비어 오는 경우는 계정 삭제 직후뿐이다. 그때도 준비 인원 계산은
      // 계속 맞아야 하므로 행을 버리지 않고 이름만 대체한다.
      nickname: profiles?.nickname ?? '탈퇴한 멤버',
      avatar_key: profiles?.avatar_key ?? 'avatar-01',
    }));
}

/**
 * 그룹 만들기.
 *
 * 서버 RPC는 처음부터 아이콘·색·시간대·한도·초기화 시각을 받도록 만들어져 있었고,
 * 지금까지 이름만 넘기고 있었다. 온보딩의 그룹 만들기 화면이 강조색과 공동 시간을
 * 고르게 되면서 나머지도 실어 보낸다 — 마이그레이션은 필요 없다.
 *
 * `colorKey`는 서버 제약(`^color-[0-9]{2}$`)을 따르고, 디자인의 세 강조색과의
 * 대응은 `lib/today.ts`의 매핑 한 곳에만 있다.
 */
export async function createGroup(
  name: string,
  options: { colorKey?: string; dailyLimitSeconds?: number } = {}
): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('create_group', {
    group_name: name,
    ...(options.colorKey ? { color_key: options.colorKey } : {}),
    ...(options.dailyLimitSeconds ? { daily_limit_seconds: options.dailyLimitSeconds } : {}),
  });
  if (error) throw rpcError(error, '그룹을 만들지 못했습니다');
  return data as GroupSnapshot;
}


export type GroupPreview = {
  name: string;
  color_key: string;
  status: 'draft' | 'active';
  member_count: number;
  daily_limit_seconds: number;
};

/**
 * 참여 전에 보는 그룹 요약.
 *
 * 코드가 맞는지 아는 유일한 방법이다 — RLS는 멤버에게만 그룹을 보여주므로 화면이
 * 스스로 확인할 방법이 없고, 그래서 예전에는 아무 여섯 자리나 통과했다.
 *
 * 사람 이름은 오지 않는다(0825 마이그레이션). 앉은 자리와 빈 자리의 수만 그린다.
 */
export async function previewGroup(inviteCode: string): Promise<GroupPreview> {
  const { data, error } = await supabase.rpc('group_preview', {
    target_invite_code: inviteCode,
  });
  if (error) throw rpcError(error, '초대 코드를 확인하지 못했습니다');
  return data as GroupPreview;
}

export async function joinGroup(inviteCode: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('join_group', {
    target_invite_code: inviteCode,
  });
  if (error) throw rpcError(error, '그룹에 참여하지 못했습니다');
  return data as GroupSnapshot;
}

export async function startGroup(groupId: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('start_group', { target_group_id: groupId });
  if (error) throw rpcError(error, '그룹을 시작하지 못했습니다');
  return data as GroupSnapshot;
}

/**
 * 그룹에서 나간다.
 *
 * **삭제가 아니라 탈퇴다.** 서버에 하드 삭제는 없다 — 사용량 기록에 보관 기간이
 * 따로 걸려 있어서(원본 7일, 확정 집계 90일) 행을 지우면 남은 사람들의 지난
 * 집계가 함께 무너진다.
 *
 * 반영 시각이 둘로 갈린다. 시작 전 그룹이면 지금, 집계 중인 그룹이면 **다음
 * 오전 6시**다. 오늘의 공동 풀은 이미 내 시간을 담고 있어서, 지금 빼면 남은
 * 사람들의 잔여가 갑자기 늘어난다.
 *
 * 남는 사람이 2명 미만이면 서버가 그룹을 그 자리에서 보관 처리한다. 보관된
 * 그룹은 `listMyGroups`가 걸러 내므로 목록에서 바로 사라진다 — 사용자 눈에는
 * 그게 "삭제"다.
 *
 * 관리자는 살아남을 그룹을 두고 나갈 수 없다. 서버가 `admin_must_transfer`로
 * 막는다(관리자 없는 그룹이 되기 때문이다).
 */
export async function leaveGroup(groupId: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('leave_group', { target_group_id: groupId });
  if (error) throw rpcError(error, '그룹에서 나가지 못했습니다');
  return data as GroupSnapshot;
}

/**
 * 관리자 권한을 넘긴다.
 *
 * 서버가 받을 사람을 두 가지로 거른다 — 이미 나간 사람과 **탈퇴를 예약한
 * 사람**이다. 후자를 허용하면 오전 6시에 관리자 없는 그룹이 남아서, 애초에
 * 이전을 강제한 이유가 그대로 재발한다. 화면도 같은 사람을 걸러야 한다
 * (`effective_until`이 있는 멤버).
 */
export async function transferAdmin(groupId: string, newAdminId: string): Promise<GroupSnapshot> {
  const { data, error } = await supabase.rpc('transfer_admin', {
    target_group_id: groupId,
    new_admin_id: newAdminId,
  });
  if (error) throw rpcError(error, '관리자를 넘기지 못했습니다');
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

  if (error) throw rpcError(error, '준비 상태를 바꾸지 못했습니다');
}

/**
 * 내 멤버십의 개인 설정.
 *
 * 그룹 목록과 따로 읽는다. 멤버십에는 남에게 보이는 값(역할·준비)과 나만의
 * 값(음소거)이 섞여 있는데, 화면이 필요로 하는 것은 후자뿐이고 그룹마다 멤버
 * 목록을 통째로 불러올 이유가 없다.
 */
export async function listMyMemberships(): Promise<
  { group_id: string; notifications_muted: boolean }[]
> {
  const { data: session } = await supabase.auth.getSession();
  const profileId = session.session?.user.id;
  if (!profileId) throw new Error('로그인 세션이 없습니다.');

  const { data, error } = await supabase
    .from('group_memberships')
    .select('group_id, notifications_muted')
    .eq('profile_id', profileId);

  if (error) throw rpcError(error, '알림 설정을 읽지 못했습니다');
  return data ?? [];
}

/**
 * 그룹별 콕 찌르기 음소거.
 *
 * `setReady`와 같이 RPC가 아니라 테이블 UPDATE다. 본인 행의 본인 설정이라 서버가
 * 검사할 규칙이 없고, 남의 행은 RLS가 막는다.
 *
 * 한도 알림은 이 스위치와 무관하다(plan.md 58행). 공동 풀은 그룹의 사정이라
 * 개인이 끄는 대상이 아니다.
 */
export async function setMuted(groupId: string, muted: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const profileId = session.session?.user.id;
  if (!profileId) throw new Error('로그인 세션이 없습니다.');

  const { error } = await supabase
    .from('group_memberships')
    .update({ notifications_muted: muted })
    .eq('group_id', groupId)
    .eq('profile_id', profileId);

  if (error) throw rpcError(error, '알림 설정을 바꾸지 못했습니다');
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
  return toMyGroup(created);
}

/** RPC가 돌려준 스냅샷에서 목록용 모양만 뽑는다. */
export function toMyGroup(snapshot: GroupSnapshot): MyGroup {
  return {
    id: snapshot.group.id,
    name: snapshot.group.name,
    status: snapshot.group.status,
    invite_code: snapshot.group.invite_code,
    icon_key: snapshot.group.icon_key,
    color_key: snapshot.group.color_key,
    admin_id: snapshot.group.admin_id,
    started_at: snapshot.group.started_at,
    time_zone: snapshot.group.time_zone,
  };
}

/** 그룹을 시작하려면 준비된 멤버가 2명 이상이어야 한다(plan.md 33행). */
export const READY_MEMBERS_TO_START = 2;

/**
 * 한 사람이 참여할 수 있는 그룹 수.
 *
 * 서버의 `create_group`·`join_group`이 같은 값으로 막는다(`too_many_groups`).
 * 화면은 그 거절을 미리 알아 "그룹 추가"를 그리지 않는 데만 쓴다 — 우회 수단이
 * 아니라 예의다.
 */
export const MAX_ACTIVE_GROUPS = 5;

/** 그룹 정원. 서버의 `join_group`이 같은 값으로 막는다(`group_full`). */
export const GROUP_SEAT_LIMIT = 8;

export function countReady(members: GroupMember[]): number {
  return members.filter((member) => member.is_ready).length;
}
