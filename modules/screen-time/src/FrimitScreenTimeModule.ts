import { NativeModule, requireNativeModule } from 'expo';

import {
  FrimitScreenTimeModuleEvents,
  PermissionState,
  SelectionSummary,
} from './FrimitScreenTime.types';

/**
 * 네이티브가 실제로 주고받는 형태. 시각은 전부 epoch ms다.
 *
 * ISO 8601 문자열로 바꾸는 일은 JS 쪽(`index.ts`)에서 한다. Android 최소 버전이
 * API 24라 java.time을 그냥 쓸 수 없고, 날짜 파싱을 양쪽 네이티브에 중복 구현할
 * 이유도 없기 때문이다.
 */
export type NativeUsageSnapshot = {
  groupId: string;
  periodStartMs: number;
  cumulativeSeconds: number;
  collectedAtMs: number;
  permissionState: PermissionState;
  source: 'ios-device-activity' | 'android-usage-stats';
  sequence: number;
};

/** Android 선택 화면에서만 쓰는 앱 정보. 스냅샷 경로에는 절대 들어가지 않는다. */
export type SelectableApp = {
  packageName: string;
  label: string;
};

declare class FrimitScreenTimeModule extends NativeModule<FrimitScreenTimeModuleEvents> {
  /** 이 기기/OS에서 사용량 수집이 가능한지 */
  readonly isSupported: boolean;

  /** 현재 권한 상태. 시스템 설정에서 해제됐을 수 있으므로 앱 복귀 시마다 확인할 것 */
  getPermissionState(): PermissionState;

  /**
   * iOS: Family Controls 승인 시트를 띄우고 결과를 반환한다.
   * Android: Usage Access 설정 화면을 열기만 한다. 반환값은 "열기 직전" 상태이므로
   * 앱으로 돌아온 뒤 `getPermissionState()`로 다시 확인해야 한다.
   */
  requestPermissionAsync(): Promise<PermissionState>;

  getSelectionSummary(groupId: string): SelectionSummary;

  /** 그룹 탈퇴 등으로 추적을 완전히 중단할 때 */
  clearSelection(groupId: string): void;

  /**
   * `periodStartMs` 이후의 사용량만 누적한다. 오전 6시 경계마다 다시 호출한다.
   *
   * iOS는 `timeZoneIdentifier` 기준으로 "매일 그 시각에 반복"되는 DeviceActivity
   * 스케줄을 건다. Android는 절대 시각으로 직접 계산하므로 시간대를 쓰지 않는다.
   */
  startTrackingAsync(
    groupId: string,
    periodStartMs: number,
    timeZoneIdentifier: string
  ): Promise<void>;

  stopTrackingAsync(groupId: string): Promise<void>;

  /** 선택이 없거나 아직 추적을 시작하지 않았으면 null */
  getSnapshotAsync(groupId: string): Promise<NativeUsageSnapshot | null>;

  getAllSnapshotsAsync(): Promise<NativeUsageSnapshot[]>;

  /** iOS 전용. 임계값 경로가 마지막으로 무엇을 언제 기록했는지 (스파이크 계측용) */
  getUsageDetail(groupId: string): {
    /** 백그라운드 임계값 콜백으로 쌓인 계단값 */
    thresholdSeconds: number;
    /** extension이 그 값을 기록한 시각 (epoch ms). 한 번도 없으면 null */
    lastUpdatedAt: number | null;
  };

  /** 스파이크 진단용. iOS 전용이며 App Group 연결과 동시 감시 개수를 확인한다 */
  getDiagnostics(): {
    appGroupConfigured: boolean;
    appGroupIdentifier: string | null;
    activeMonitorCount: number;
    thresholdEventCount: number;
  };

  // --- iOS 전용 ---

  /** 시스템 `FamilyActivityPicker`를 띄운다. 앱의 정체는 JS로 넘어오지 않는다 */
  presentSelectionAsync(groupId: string): Promise<SelectionSummary>;

  // --- Android 전용 ---

  /** 런처에 보이는 설치 앱 목록. 선택 화면 렌더링에만 쓴다 */
  getSelectableAppsAsync(): Promise<SelectableApp[]>;

  setSelection(groupId: string, packageNames: string[]): SelectionSummary;
}

export default requireNativeModule<FrimitScreenTimeModule>('FrimitScreenTime');
