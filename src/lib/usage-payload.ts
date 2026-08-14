import type { PermissionState, UsageSnapshot, UsageSource } from '@modules/screen-time';

/**
 * 네이티브가 준 스냅샷을 서버 RPC가 받는 모양으로 옮긴다.
 *
 * 이 파일에 네트워크도 네이티브 모듈도 들어오지 않는다. 순수 변환만 남겨 두면
 * 실기기 없이도 계약을 테스트할 수 있고, 이름이 어긋나는 실수는 대부분 여기서 난다.
 * (JS는 camelCase, Postgres는 snake_case를 쓴다.)
 */

/** record_usage_snapshots가 받는 한 건. 키 이름이 서버 함수의 인자 이름이다. */
export type UsageSnapshotRow = {
  device_id: string;
  group_id: string;
  period_start: string;
  cumulative_seconds: number;
  collected_at: string;
  permission_state: PermissionState;
  source: UsageSource;
  sequence: number;
};

/**
 * 서버가 한 건에 대해 돌려주는 결과. 거절된 건에는 hint가 붙는다.
 *
 * - recorded  확정값이 올랐다(첫 기록 포함)
 * - stale     받아서 원본으로는 남겼지만 확정값은 그대로다. 앱을 껐다 켜기만 한
 *             경우가 여기 해당한다 — 실패가 아니다
 * - duplicate 같은 요청을 재전송했다(멱등 키가 같다)
 */
export type UsageSyncResult = {
  status: 'recorded' | 'stale' | 'duplicate' | 'rejected';
  group_id: string;
  period_start?: string;
  confirmed_seconds?: number;
  accepted_seconds?: number;
  /** 이번 동기화로 확정값이 오른 초. 0이면 아무것도 바뀌지 않았다. */
  gained_seconds?: number;
  hint?: string;
  message?: string;
};

export type UsageSyncSummary = {
  total: number;
  recorded: number;
  stale: number;
  duplicate: number;
  rejected: number;
  /** 서버에 존재할 수 없는 그룹이라 보내지도 않은 것. */
  skipped: number;
  /** 거절된 건만 추린 것. 화면에 사유를 보여주거나 로그에 남길 때 쓴다. */
  rejections: { groupId: string; hint: string }[];
};

/**
 * 서버 그룹 id인가.
 *
 * 네이티브는 groupId를 그냥 문자열로 다루므로, 예전 빌드가 남긴 로컬 전용 id
 * ('spike-group-1' 같은)가 기기에 그대로 남아 있을 수 있다. 그런 건 서버에서
 * uuid 캐스팅부터 실패해 매번 거절되는데, 보내 봐야 결과가 정해져 있으므로
 * 올리기 전에 걸러 낸다.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isServerGroupId(groupId: string): boolean {
  return UUID_PATTERN.test(groupId);
}

/** 올릴 수 있는 것과 서버에 존재할 수 없는 것을 가른다. */
export function partitionSnapshots(snapshots: UsageSnapshot[]): {
  syncable: UsageSnapshot[];
  skipped: string[];
} {
  const syncable: UsageSnapshot[] = [];
  const skipped: string[] = [];

  for (const snapshot of snapshots) {
    if (isServerGroupId(snapshot.groupId)) syncable.push(snapshot);
    else skipped.push(snapshot.groupId);
  }

  return { syncable, skipped };
}

export function toSnapshotRow(snapshot: UsageSnapshot, deviceId: string): UsageSnapshotRow {
  return {
    device_id: deviceId,
    group_id: snapshot.groupId,
    period_start: snapshot.periodStart,
    // 서버가 정수만 받는다. 네이티브가 소수를 줄 일은 없지만, 여기서 어긋나면
    // 22P02(잘못된 입력)로 그 건 전체가 거절되므로 확실히 잘라 둔다.
    cumulative_seconds: Math.max(0, Math.floor(snapshot.cumulativeSeconds)),
    collected_at: snapshot.collectedAt,
    permission_state: snapshot.permissionState,
    source: snapshot.source,
    sequence: Math.max(0, Math.floor(snapshot.sequence)),
  };
}

export function toSnapshotRows(
  snapshots: UsageSnapshot[],
  deviceId: string
): UsageSnapshotRow[] {
  return snapshots.map((snapshot) => toSnapshotRow(snapshot, deviceId));
}

export function summarizeSyncResults(
  results: UsageSyncResult[],
  skippedGroupIds: string[] = []
): UsageSyncSummary {
  const summary: UsageSyncSummary = {
    total: results.length,
    recorded: 0,
    stale: 0,
    duplicate: 0,
    rejected: 0,
    skipped: skippedGroupIds.length,
    rejections: [],
  };

  for (const result of results) {
    switch (result.status) {
      case 'recorded':
        summary.recorded += 1;
        break;
      case 'stale':
        summary.stale += 1;
        break;
      case 'duplicate':
        summary.duplicate += 1;
        break;
      case 'rejected':
        summary.rejected += 1;
        summary.rejections.push({
          groupId: result.group_id,
          // 빈 문자열도 없는 것으로 친다. 서버가 hint 없는 오류(캐스팅 실패 등)를
          // 그대로 넘기면 `거절 1()`처럼 괄호만 남아 아무것도 알려주지 못한다.
          hint: result.hint || 'unknown',
        });
        break;
    }
  }

  return summary;
}

/**
 * 사람이 읽을 한 줄. 스파이크 화면의 기록과 개발 로그가 같은 문장을 쓴다.
 *
 * duplicate와 stale은 실패가 아니다. 같은 값을 두 번 보내는 것도, 늦게 도착한
 * 낮은 값이 채택되지 않는 것도 설계된 동작이라 따로 세되 문제로 보이지 않게 쓴다.
 */
export function describeSyncSummary(summary: UsageSyncSummary): string {
  if (summary.total === 0) {
    return summary.skipped > 0
      ? `올릴 사용량이 없습니다 (서버에 없는 그룹 ${summary.skipped}개 건너뜀)`
      : '올릴 사용량이 없습니다';
  }

  const parts = [`기록 ${summary.recorded}`];
  if (summary.skipped > 0) parts.push(`건너뜀 ${summary.skipped}`);
  if (summary.duplicate > 0) parts.push(`중복 ${summary.duplicate}`);
  if (summary.stale > 0) parts.push(`무시 ${summary.stale}`);
  if (summary.rejected > 0) {
    const reasons = summary.rejections.map((r) => r.hint).join(', ');
    parts.push(`거절 ${summary.rejected}(${reasons})`);
  }

  return `${summary.total}건 중 ${parts.join(' · ')}`;
}
