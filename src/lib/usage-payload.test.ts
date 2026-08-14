import { describe, expect, it } from 'vitest';

import {
  describeSyncSummary,
  isServerGroupId,
  partitionSnapshots,
  summarizeSyncResults,
  toSnapshotRow,
  toSnapshotRows,
  type UsageSyncResult,
} from './usage-payload';
import type { UsageSnapshot } from '@modules/screen-time';

const snapshot: UsageSnapshot = {
  groupId: 'group-1',
  periodStart: '2026-08-13T21:00:00.000Z',
  cumulativeSeconds: 1800,
  collectedAt: '2026-08-14T01:23:45.000Z',
  permissionState: 'granted',
  source: 'ios-device-activity',
  sequence: 7,
};

describe('toSnapshotRow', () => {
  it('서버 인자 이름(snake_case)으로 옮긴다', () => {
    expect(toSnapshotRow(snapshot, 'device-1')).toEqual({
      device_id: 'device-1',
      group_id: 'group-1',
      period_start: '2026-08-13T21:00:00.000Z',
      cumulative_seconds: 1800,
      collected_at: '2026-08-14T01:23:45.000Z',
      permission_state: 'granted',
      source: 'ios-device-activity',
      sequence: 7,
    });
  });

  it('소수를 정수로 자른다', () => {
    // 서버 쪽 인자가 int라, 소수가 섞이면 그 건 전체가 22P02로 거절된다.
    const row = toSnapshotRow({ ...snapshot, cumulativeSeconds: 90.9, sequence: 3.7 }, 'd');
    expect(row.cumulative_seconds).toBe(90);
    expect(row.sequence).toBe(3);
  });

  it('음수는 0으로 막는다', () => {
    const row = toSnapshotRow({ ...snapshot, cumulativeSeconds: -5 }, 'd');
    expect(row.cumulative_seconds).toBe(0);
  });

  it('여러 건에 같은 기기 id를 붙인다', () => {
    const rows = toSnapshotRows([snapshot, { ...snapshot, groupId: 'group-2' }], 'device-9');
    expect(rows.map((r) => r.device_id)).toEqual(['device-9', 'device-9']);
    expect(rows.map((r) => r.group_id)).toEqual(['group-1', 'group-2']);
  });
});

describe('partitionSnapshots', () => {
  it('서버 그룹 id만 골라낸다', () => {
    // 예전 빌드가 남긴 로컬 전용 id는 서버에서 uuid 캐스팅부터 실패한다.
    const { syncable, skipped } = partitionSnapshots([
      { ...snapshot, groupId: '382f578e-217d-41f1-9887-921e2c614778' },
      { ...snapshot, groupId: 'spike-group-1' },
    ]);

    expect(syncable.map((s) => s.groupId)).toEqual(['382f578e-217d-41f1-9887-921e2c614778']);
    expect(skipped).toEqual(['spike-group-1']);
  });

  it('대문자 uuid도 받는다', () => {
    expect(isServerGroupId('382F578E-217D-41F1-9887-921E2C614778')).toBe(true);
    expect(isServerGroupId('spike-group-1')).toBe(false);
    expect(isServerGroupId('')).toBe(false);
  });
});

describe('summarizeSyncResults', () => {
  const results: UsageSyncResult[] = [
    { status: 'recorded', group_id: 'g1', confirmed_seconds: 1800 },
    { status: 'duplicate', group_id: 'g2' },
    { status: 'stale', group_id: 'g3', confirmed_seconds: 600 },
    { status: 'rejected', group_id: 'g4', hint: 'group_not_collecting' },
    { status: 'rejected', group_id: 'g5' },
  ];

  it('상태별로 센다', () => {
    const summary = summarizeSyncResults(results);
    expect(summary).toMatchObject({
      total: 5,
      recorded: 1,
      duplicate: 1,
      stale: 1,
      rejected: 2,
    });
  });

  it('거절 사유를 모은다. 사유가 없으면 unknown으로 남긴다', () => {
    expect(summarizeSyncResults(results).rejections).toEqual([
      { groupId: 'g4', hint: 'group_not_collecting' },
      { groupId: 'g5', hint: 'unknown' },
    ]);
  });

  it('빈 문자열 사유도 unknown으로 바꾼다', () => {
    // 이걸 그대로 두면 화면에 `거절 1()`처럼 괄호만 남는다.
    const summary = summarizeSyncResults([{ status: 'rejected', group_id: 'g1', hint: '' }]);
    expect(summary.rejections).toEqual([{ groupId: 'g1', hint: 'unknown' }]);
  });

  it('보내지 않고 건너뛴 그룹을 함께 센다', () => {
    const summary = summarizeSyncResults([{ status: 'recorded', group_id: 'g1' }], ['legacy-1']);
    expect(summary).toMatchObject({ total: 1, recorded: 1, skipped: 1 });
  });

  it('빈 결과도 다룬다', () => {
    expect(summarizeSyncResults([])).toMatchObject({ total: 0, recorded: 0, rejections: [] });
  });
});

describe('describeSyncSummary', () => {
  it('올릴 것이 없으면 그렇게 말한다', () => {
    expect(describeSyncSummary(summarizeSyncResults([]))).toBe('올릴 사용량이 없습니다');
  });

  it('문제가 없으면 기록 수만 말한다', () => {
    const summary = summarizeSyncResults([{ status: 'recorded', group_id: 'g1' }]);
    expect(describeSyncSummary(summary)).toBe('1건 중 기록 1');
  });

  it('거절이 있으면 사유를 함께 보여준다', () => {
    const summary = summarizeSyncResults([
      { status: 'recorded', group_id: 'g1' },
      { status: 'rejected', group_id: 'g2', hint: 'not_in_period' },
    ]);
    expect(describeSyncSummary(summary)).toBe('2건 중 기록 1 · 거절 1(not_in_period)');
  });

  it('중복과 무시는 실패로 세지 않는다', () => {
    // 같은 값을 두 번 보내는 것도, 늦게 온 낮은 값이 채택되지 않는 것도 설계된 동작이다.
    const summary = summarizeSyncResults([
      { status: 'duplicate', group_id: 'g1' },
      { status: 'stale', group_id: 'g2' },
    ]);
    expect(describeSyncSummary(summary)).toBe('2건 중 기록 0 · 중복 1 · 무시 1');
  });
});
