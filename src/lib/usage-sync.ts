import { ScreenTime, type UsageSnapshot } from '@modules/screen-time';

import { ensureDevice } from './device';
import {
  DEFAULT_TIME_ZONE,
  isStalePeriod,
  nextPeriodStartFor,
  periodStartFor,
} from './frimit-day';
import { requireSession, supabase } from './supabase';
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
  await requireSession();

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

  // 올린 **뒤에** 넘긴다. 순서가 바뀌면 지난 구간의 마지막 몇 분이 사라진다.
  // 이 값이 구간 끝을 넘겨 부풀지 않는 것은 네이티브가 보장한다(FrimitStore.periodEnd).
  const results = await uploadSnapshots(syncable, deviceId);
  const rolled = await rollTrackingPeriods(syncable);

  // 넘긴 그룹은 새 구간의 첫 값을 여기서 바로 올린다. 다음 동기화까지 미루면
  // 경계를 넘긴 뒤 앱을 닫아 버린 경우 서버에 오늘 칸이 아예 생기지 않는다 —
  // 다른 구성원 화면에서는 그 사람이 오늘 하나도 안 쓴 것으로 보인다.
  const afterRoll = rolled.length > 0 ? await uploadRolledGroups(rolled, deviceId) : [];

  return summarizeSyncResults([...results, ...afterRoll], skipped, rolled);
}

async function uploadSnapshots(
  snapshots: UsageSnapshot[],
  deviceId: string
): Promise<UsageSyncResult[]> {
  const { data, error } = await supabase.rpc('record_usage_snapshots', {
    snapshots: toSnapshotRows(snapshots, deviceId),
  });

  if (error) {
    throw new Error(`사용량을 올리지 못했습니다: ${error.message}`);
  }

  return (data ?? []) as UsageSyncResult[];
}

/** 방금 새 구간으로 넘긴 그룹만 다시 읽어 올린다. */
async function uploadRolledGroups(
  groupIds: string[],
  deviceId: string
): Promise<UsageSyncResult[]> {
  const fresh = (await ScreenTime.getAllSnapshots()).filter((snapshot) =>
    groupIds.includes(snapshot.groupId)
  );

  return fresh.length > 0 ? uploadSnapshots(fresh, deviceId) : [];
}

/**
 * 하루 경계를 지난 그룹의 집계 구간을 새 경계로 다시 무장한다.
 *
 * 기기에 저장된 구간 시작은 "집계 시작"을 누른 순간의 값이고, 그것을 오전 6시에
 * 옮겨 줄 주체가 Android에는 없다. iOS는 `DeviceActivitySchedule`이 매일 반복되어
 * extension의 `intervalDidStart`가 대신 해 주지만, Android에는 그런 콜백이 아예
 * 없다. 실제로 실기기 검증 중에 이틀 내내 같은 구간으로 올라갔다 — 어제와 오늘의
 * 사용량이 한 칸에 합쳐지고, 날짜 라벨은 이틀 전을 가리켰다.
 *
 * Android는 스냅샷을 읽을 때마다 `queryEvents`로 구간 전체를 다시 계산하므로,
 * 경계만 갱신하면 앱이 며칠 닫혀 있었어도 새 구간의 값이 정확하다. 그래서 여기서
 * 다시 무장하는 것으로 충분하고, 경계 계산도 이 한 곳(TypeScript)에 남는다.
 *
 * 낡았는지의 판단은 `isStalePeriod`에 있다 — 시각이 아니라 날짜 라벨로 견주는
 * 이유가 거기 적혀 있고, 그 규칙이 틀리면 iOS의 하루 누적이 조용히 0이 된다.
 */
async function rollTrackingPeriods(snapshots: UsageSnapshot[]): Promise<string[]> {
  const now = new Date();
  const rolled: string[] = [];

  for (const snapshot of snapshots) {
    if (!isStalePeriod(new Date(snapshot.periodStart), now, DEFAULT_TIME_ZONE)) continue;

    await ScreenTime.startTracking(
      snapshot.groupId,
      periodStartFor(now, DEFAULT_TIME_ZONE),
      nextPeriodStartFor(now, DEFAULT_TIME_ZONE),
      DEFAULT_TIME_ZONE
    );
    rolled.push(snapshot.groupId);
  }

  return rolled;
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
