/**
 * 이 파일은 네이티브 ↔ JavaScript 사이의 **공개 계약**이다.
 *
 * plan.md의 프라이버시 규칙에 따라, 여기에는 다음 값이 절대 포함되지 않는다:
 * - 앱 이름 / 표시 이름
 * - Android 패키지명
 * - iOS `ApplicationToken` / `ActivityCategoryToken` / `WebDomainToken`
 *
 * 선택한 대상의 정체는 기기 안에만 머무르고, 밖으로는 "몇 개를 골랐는지"와
 * "합계 몇 초를 썼는지"만 나간다.
 */

/** OS 사용량 권한 상태. */
export type PermissionState =
  /** 아직 물어보지 않음 */
  | 'notDetermined'
  /** 사용 가능 */
  | 'granted'
  /** 사용자가 거부했거나 나중에 해제함 */
  | 'denied'
  /** 기기 정책(스크린타임 제한, MDM 등)으로 요청 자체가 불가 */
  | 'restricted'
  /** 이 플랫폼/OS 버전에서는 지원하지 않음 */
  | 'unavailable';

/** 사용량 스냅샷의 출처. 서버가 플랫폼별 정확도를 구분하는 데 쓴다. */
export type UsageSource = 'ios-device-activity' | 'android-usage-stats';

/**
 * 그룹별 추적 대상 선택 요약.
 * 그룹에 공개되는 것은 `selectionCount`뿐이다.
 */
export type SelectionSummary = {
  groupId: string;
  /** 선택한 앱 + 카테고리 + 웹도메인의 총 개수 */
  selectionCount: number;
  /** 마지막으로 선택을 변경한 시각 (epoch ms). 한 번도 고르지 않았으면 null */
  updatedAt: number | null;
};

/**
 * 서버로 올라가는 사용량 스냅샷. plan.md §4의 `UsageSnapshot` 계약과 1:1로 대응한다.
 */
export type UsageSnapshot = {
  groupId: string;
  /** 집계 구간의 시작 (그룹 시간대 기준 오전 6시), ISO 8601 */
  periodStart: string;
  /** 구간 시작부터의 누적 사용 초. 서버는 이 값이 감소하지 않는다고 가정한다 */
  cumulativeSeconds: number;
  /** 이 값을 기기에서 읽어낸 시각, ISO 8601 */
  collectedAt: string;
  permissionState: PermissionState;
  source: UsageSource;
  /** 같은 (device, group, period) 안에서 단조 증가하는 순번. 서버 멱등 처리용 */
  sequence: number;
};

/**
 * 네이티브가 스스로 사용량을 갱신했을 때 보내는 이벤트.
 * iOS는 DeviceActivity 임계값 콜백, Android는 WorkManager 주기 집계에서 발생한다.
 */
export type UsageUpdatePayload = {
  groupId: string;
  cumulativeSeconds: number;
  collectedAt: string;
};

export type FrimitScreenTimeModuleEvents = {
  onUsageUpdate: (payload: UsageUpdatePayload) => void;
  onPermissionChange: (payload: { permissionState: PermissionState }) => void;
};
