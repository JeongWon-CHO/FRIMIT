import { Platform } from 'react-native';

import Native, {
  type NativeUsageSnapshot,
  type SelectableApp,
} from './src/FrimitScreenTimeModule';
import type {
  PermissionState,
  SelectionSummary,
  UsageSnapshot,
  UsageUpdatePayload,
} from './src/FrimitScreenTime.types';

export * from './src/FrimitScreenTime.types';
export type { SelectableApp } from './src/FrimitScreenTimeModule';

function toSnapshot(native: NativeUsageSnapshot): UsageSnapshot {
  return {
    groupId: native.groupId,
    periodStart: new Date(native.periodStartMs).toISOString(),
    cumulativeSeconds: native.cumulativeSeconds,
    collectedAt: new Date(native.collectedAtMs).toISOString(),
    permissionState: native.permissionState,
    source: native.source,
    sequence: native.sequence,
  };
}

function assertPlatform(platform: 'ios' | 'android', api: string) {
  if (Platform.OS !== platform) {
    throw new Error(`ScreenTime.${api}()는 ${platform}에서만 사용할 수 있습니다.`);
  }
}

/**
 * 사용량 수집 모듈의 JS 표면.
 *
 * iOS와 Android는 앱을 고르는 방식이 근본적으로 다르다. iOS는 Apple이 그리는
 * 시스템 picker를 띄우고 우리는 불투명한 토큰만 받는 반면, Android에는 그런
 * 시스템 UI가 없어서 설치된 앱 목록을 우리가 직접 보여줘야 한다.
 * 그 차이를 감추지 않고 플랫폼별 API로 드러낸다.
 */
export const ScreenTime = {
  isSupported: Native.isSupported,

  getPermissionState: (): PermissionState => Native.getPermissionState(),

  requestPermission: (): Promise<PermissionState> => Native.requestPermissionAsync(),

  getSelectionSummary: (groupId: string): SelectionSummary =>
    Native.getSelectionSummary(groupId),

  clearSelection: (groupId: string): void => Native.clearSelection(groupId),

  /**
   * `periodStart`는 그룹 시간대 기준 오전 6시, `periodEnd`는 그 다음 오전 6시여야
   * 한다. 서머타임이 있는 시간대에서는 둘의 간격이 24시간이 아니므로, 경계 계산은
   * 부르는 쪽(`src/lib/frimit-day.ts`)에 두고 여기서는 받은 값을 그대로 넘긴다.
   *
   * `timeZone`은 그룹의 시간대 식별자(기본 `Asia/Seoul`)다.
   */
  startTracking: (
    groupId: string,
    periodStart: Date,
    periodEnd: Date,
    timeZone = 'Asia/Seoul'
  ): Promise<void> =>
    Native.startTrackingAsync(groupId, periodStart.getTime(), periodEnd.getTime(), timeZone),

  stopTracking: (groupId: string): Promise<void> => Native.stopTrackingAsync(groupId),

  getSnapshot: async (groupId: string): Promise<UsageSnapshot | null> => {
    const native = await Native.getSnapshotAsync(groupId);
    return native ? toSnapshot(native) : null;
  },

  getAllSnapshots: async (): Promise<UsageSnapshot[]> => {
    const natives = await Native.getAllSnapshotsAsync();
    return natives.map(toSnapshot);
  },

  /**
   * 서버가 알려준 그룹 잔여 시간을 차단선으로 심는다. 지금 잠겼으면 true.
   *
   * iOS 전용이지만 **던지지 않는다.** 동기화는 두 플랫폼에서 같은 코드로 도는데,
   * 차단은 iOS에만 있다. 여기서 던지면 Android의 동기화가 사용량을 다 올려 놓고
   * 마지막에 실패로 끝난다 — 없는 기능 때문에 있는 기능이 무너진다.
   */
  applyShieldBudget: (groupId: string, remainingSeconds: number): boolean => {
    if (Platform.OS !== 'ios') return false;
    return Native.applyShieldBudget(groupId, Math.max(0, Math.floor(remainingSeconds)));
  },

  /** 차단선을 지우고 잠금도 푼다. iOS가 아니면 아무 일도 하지 않는다 */
  clearShield: (groupId: string): void => {
    if (Platform.OS !== 'ios') return;
    Native.clearShield(groupId);
  },

  /**
   * 그룹 이름을 기기에 베껴 둔다. 차단 화면이 이 값을 읽는다.
   *
   * iOS 전용이고 던지지 않는다 — 그룹 목록을 읽는 평범한 경로에서 불리므로,
   * 여기서 실패하면 목록이 통째로 안 그려진다.
   */
  setGroupLabel: (groupId: string, name: string): void => {
    if (Platform.OS !== 'ios') return;
    Native.setGroupLabel(groupId, name);
  },

  /** 지금 이 그룹의 앱이 잠겨 있는가. iOS가 아니면 항상 false */
  isShielded: (groupId: string): boolean =>
    Platform.OS === 'ios' && Native.isShielded(groupId),

  /** iOS 전용: 시스템 FamilyActivityPicker */
  presentSelection: (groupId: string): Promise<SelectionSummary> => {
    assertPlatform('ios', 'presentSelection');
    return Native.presentSelectionAsync(groupId);
  },

  /** Android 전용: 선택 화면에 뿌릴 설치 앱 목록 */
  getSelectableApps: (): Promise<SelectableApp[]> => {
    assertPlatform('android', 'getSelectableApps');
    return Native.getSelectableAppsAsync();
  },

  /** Android 전용: 선택 화면에서 고른 결과를 저장 */
  setSelection: (groupId: string, packageNames: string[]): SelectionSummary => {
    assertPlatform('android', 'setSelection');
    return Native.setSelection(groupId, packageNames);
  },

  /** iOS 전용. 임계값 경로가 마지막으로 기록한 값과 시각 (스파이크 계측용) */
  getUsageDetail: (groupId: string) => {
    assertPlatform('ios', 'getUsageDetail');
    return Native.getUsageDetail(groupId);
  },

  /** iOS 전용 진단값. 스파이크 화면에서 App Group 연결 상태를 눈으로 확인하는 용도 */
  getDiagnostics: () => {
    assertPlatform('ios', 'getDiagnostics');
    return Native.getDiagnostics();
  },

  addUsageUpdateListener: (listener: (payload: UsageUpdatePayload) => void) =>
    Native.addListener('onUsageUpdate', listener),

  addPermissionChangeListener: (
    listener: (payload: { permissionState: PermissionState }) => void
  ) => Native.addListener('onPermissionChange', listener),
};

export default Native;
