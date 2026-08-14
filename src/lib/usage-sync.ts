import { ScreenTime, type UsageSnapshot } from '@modules/screen-time';

import { ensureDevice } from './device';
import { ensureSession, supabase } from './supabase';
import {
  partitionSnapshots,
  summarizeSyncResults,
  toSnapshotRows,
  type UsageSyncResult,
  type UsageSyncSummary,
} from './usage-payload';

/**
 * 기기가 들고 있는 모든 그룹의 누적값을 서버로 올린다.
 *
 * 한 번의 왕복으로 전부 보낸다. 그룹마다 따로 부르면 이동 통신에서 실패 지점이
 * 그만큼 늘어나고, 어차피 네이티브는 모든 그룹을 한 번에 읽어 온다.
 *
 * 실패한 건이 있어도 예외를 던지지 않는다. 서버가 건별로 사유를 돌려주므로
 * (보관된 그룹, 아직 반영되지 않은 가입 등) 그대로 요약해 넘긴다. 그중 다수는
 * 고칠 것이 없는 정상적인 거절이다.
 */
export async function syncUsage(): Promise<UsageSyncSummary> {
  await ensureSession();

  const permissionState = ScreenTime.getPermissionState();
  const deviceId = await ensureDevice(permissionState);

  const all: UsageSnapshot[] = await ScreenTime.getAllSnapshots();

  // 예전 빌드가 남긴 로컬 전용 그룹은 보내지 않는다. 서버에서 uuid 캐스팅부터
  // 실패해 매번 같은 이유로 거절되므로, 왕복도 로그도 낭비다.
  const { syncable, skipped } = partitionSnapshots(all);

  // 거르는 것만으로는 부족하다. 그 그룹의 DeviceActivity 감시가 기기에 그대로
  // 남아 동시 감시 한도(20개)와 이벤트 예산을 계속 잡아먹는다. 서버에 존재할 수
  // 없는 그룹이므로 추적 자체를 걷어낸다 — 한 번 정리되면 다시 나타나지 않는다.
  for (const groupId of skipped) {
    ScreenTime.clearSelection(groupId);
  }

  if (syncable.length === 0) {
    return summarizeSyncResults([], skipped);
  }

  const { data, error } = await supabase.rpc('record_usage_snapshots', {
    snapshots: toSnapshotRows(syncable, deviceId),
  });

  if (error) {
    throw new Error(`사용량을 올리지 못했습니다: ${error.message}`);
  }

  return summarizeSyncResults((data ?? []) as UsageSyncResult[], skipped);
}

/**
 * 그룹의 현재 공동 풀 상태. 오늘 화면이 이 값을 그대로 그린다.
 *
 * 잔여시간은 0에서 멈추고 초과분이 따로 오른다 — 한도를 넘겨도 차단하지 않는다는
 * 제품 규칙이 서버 쪽 계산에 이미 들어 있다.
 */
export type GroupDailyUsage = {
  group_id: string;
  period_start: string;
  period_end: string;
  date_key: string;
  daily_limit_seconds: number;
  total_seconds: number;
  remaining_seconds: number;
  over_seconds: number;
  member_count: number;
  members: {
    profile_id: string;
    cumulative_seconds: number;
    last_collected_at: string | null;
    permission_state: string | null;
  }[];
};

export async function fetchGroupDailyUsage(groupId: string): Promise<GroupDailyUsage> {
  const { data, error } = await supabase.rpc('group_daily_usage', {
    target_group_id: groupId,
  });

  if (error) {
    throw new Error(`공동 풀 상태를 읽지 못했습니다: ${error.message}`);
  }

  return data as GroupDailyUsage;
}
