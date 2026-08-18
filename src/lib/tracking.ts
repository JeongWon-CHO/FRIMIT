import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

import { ScreenTime, type PermissionState, type SelectableApp } from '@modules/screen-time';

import { DEFAULT_TIME_ZONE, nextPeriodStartFor, periodStartFor } from './frimit-day';

/**
 * 기기 쪽 추적 설정. 온보딩의 권한·선택 단계와 MY 탭이 이것만 쓴다.
 *
 * 여기 있는 값은 **전부 이 기기 안에만 있는 것**이다. 서버로 나가는 것은 개수와
 * 합계뿐이고(plan.md 24행), 그 경계는 네이티브 모듈의 계약이 이미 지키고 있다.
 * 이 파일이 하는 일은 그 계약에 경계 시각을 채워 넣는 것 하나다 —
 * `startTracking`은 구간의 시작과 끝을 받아야 하고, 그 계산은 `frimit-day.ts`에만 있다.
 */

/**
 * Android 선택 목록의 화면용 사본.
 *
 * 네이티브는 무엇을 골랐는지 JS에 돌려주지 않는다(개수만 준다). 프라이버시 계약상
 * 맞는 설계지만, 그래서 선택 화면에 다시 들어오면 체크가 전부 풀려 보인다.
 * 그것만을 위한 사본이다 — **측정의 근거는 언제나 네이티브 쪽 저장소**이고,
 * 저장할 때마다 화면의 목록으로 네이티브를 덮어쓰므로 둘이 어긋나도 승자는 정해져 있다.
 *
 * iOS는 시스템 picker가 상태를 직접 들고 있어 사본이 필요 없다.
 */
const SELECTION_MIRROR_PREFIX = 'frimit.tracking.selection.';

export type TrackingState = {
  permission: PermissionState;
  selectionCount: number;
  selectionUpdatedAt: number | null;
};

/**
 * 네이티브 호출은 개발 빌드가 아닌 환경(웹 미리보기 등)에서 던진다. 온보딩이
 * 그것 때문에 흰 화면이 되는 것보다 "지원 안 됨"으로 보이는 편이 낫다.
 */
export function readPermission(): PermissionState {
  try {
    return ScreenTime.getPermissionState();
  } catch {
    return 'unavailable';
  }
}

export function readTrackingState(groupId: string): TrackingState {
  const permission = readPermission();

  try {
    const summary = ScreenTime.getSelectionSummary(groupId);
    return {
      permission,
      selectionCount: summary.selectionCount,
      selectionUpdatedAt: summary.updatedAt,
    };
  } catch {
    return { permission, selectionCount: 0, selectionUpdatedAt: null };
  }
}

export async function requestPermission(): Promise<PermissionState> {
  return ScreenTime.requestPermission();
}

/**
 * 이 그룹의 집계를 지금 구간에 맞춰 무장한다.
 *
 * 같은 그룹에 두 번 불러도 안전하다 — 네이티브는 같은 구간 시작이면 누적을
 * 그대로 둔다(그 판단이 왜 날짜 라벨이어야 하는지는 `isStalePeriod`에 적혀 있다).
 * 선택을 바꾼 뒤, 그리고 그룹이 시작된 뒤에 부른다.
 */
export async function armTracking(
  groupId: string,
  timeZone: string = DEFAULT_TIME_ZONE
): Promise<void> {
  const now = new Date();
  await ScreenTime.startTracking(
    groupId,
    periodStartFor(now, timeZone),
    nextPeriodStartFor(now, timeZone),
    timeZone
  );
}

/** iOS: 시스템 FamilyActivityPicker를 띄우고 바뀐 개수를 돌려준다. */
export async function pickTargetsIOS(groupId: string): Promise<number> {
  const summary = await ScreenTime.presentSelection(groupId);
  return summary.selectionCount;
}

/** Android: 선택 화면에 뿌릴 설치 앱 목록. 이름은 기기 밖으로 나가지 않는다. */
export async function listInstalledApps(): Promise<SelectableApp[]> {
  const apps = await ScreenTime.getSelectableApps();
  return [...apps].sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'));
}

export async function readSelectedPackages(groupId: string): Promise<string[]> {
  if (Platform.OS !== 'android') return [];

  const raw = await AsyncStorage.getItem(SELECTION_MIRROR_PREFIX + groupId);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    // 사본이 깨졌으면 버린다. 다시 고르게 하는 것이 유일한 복구 경로다.
    return [];
  }
}

/** Android: 고른 목록을 네이티브에 저장하고 화면용 사본을 갱신한다. */
export async function saveSelectedPackages(
  groupId: string,
  packageNames: string[]
): Promise<number> {
  const summary = ScreenTime.setSelection(groupId, packageNames);
  await AsyncStorage.setItem(SELECTION_MIRROR_PREFIX + groupId, JSON.stringify(packageNames));
  return summary.selectionCount;
}

/**
 * 기기 상태를 React 밖의 저장소로 다룬다.
 *
 * 권한과 선택은 React가 소유하지 않는 값이다 — 사용자가 시스템 설정에서 권한을
 * 끄거나, iOS가 시작 직후 늦게 실린 권한 상태를 뒤늦게 알려줄 수 있다(실기기 1차
 * 측정에서 확인: 이미 승인된 상태인데도 몇 초간 `notDetermined`로 읽힌다).
 * 그래서 화면에 복사해 두고 동기화하는 대신 `useSyncExternalStore`로 읽는다.
 *
 * 바뀌는 경로가 셋이고 셋 다 여기서 한 번에 구독한다.
 * 1. 네이티브의 권한 변화 이벤트
 * 2. 앱 복귀 (설정에서 끄고 돌아온 경우)
 * 3. 앱 안에서의 변경 → `notifyTrackingChanged()`
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let teardown: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

/** 앱 안에서 권한을 요청하거나 대상을 고른 직후에 부른다. */
export function notifyTrackingChanged(): void {
  emit();
}

export function subscribeTracking(listener: Listener): () => void {
  listeners.add(listener);

  // 네이티브·AppState 구독은 화면 수가 아니라 한 번만 걸린다. 화면마다 걸면
  // 탭을 옮길 때마다 붙었다 떨어지고, 그 사이의 변화를 놓친다.
  if (listeners.size === 1) {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') emit();
    });

    let permissionChange: { remove: () => void } | null = null;
    try {
      permissionChange = ScreenTime.addPermissionChangeListener(() => emit());
    } catch {
      // 네이티브 모듈이 없는 환경. 앱 복귀 구독만으로도 화면은 돈다.
    }

    teardown = () => {
      appState.remove();
      permissionChange?.remove();
    };
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown?.();
      teardown = null;
    }
  };
}

/**
 * `useSyncExternalStore`가 렌더마다 부르는 읽기. **같은 값이면 같은 참조를 돌려줘야
 * 한다** — 매번 새 객체를 만들면 React가 무한히 다시 렌더한다.
 */
const snapshots = new Map<string, TrackingState>();

export function getTrackingSnapshot(groupId: string | undefined): TrackingState {
  const key = groupId ?? '';
  const next: TrackingState = groupId
    ? readTrackingState(groupId)
    : // 권한은 그룹과 무관한 기기 단위 값이라 그룹이 없을 때도 읽는다(권한 단계).
      { permission: readPermission(), selectionCount: 0, selectionUpdatedAt: null };

  const previous = snapshots.get(key);
  if (
    previous &&
    previous.permission === next.permission &&
    previous.selectionCount === next.selectionCount &&
    previous.selectionUpdatedAt === next.selectionUpdatedAt
  ) {
    return previous;
  }

  snapshots.set(key, next);
  return next;
}

/** 권한이 집계에 쓸 수 있는 상태인가. 준비 완료의 전제 조건이다. */
export function isUsable(permission: PermissionState): boolean {
  return permission === 'granted';
}

/** 권한 상태를 사람 문장으로. 거부·해제·정책 차단이 각각 다른 안내를 받아야 한다. */
export function describePermission(permission: PermissionState): string {
  switch (permission) {
    case 'granted':
      return '사용량을 읽을 수 있습니다';
    case 'notDetermined':
      return '아직 권한을 요청하지 않았습니다';
    case 'denied':
      return Platform.OS === 'ios'
        ? '설정 > 스크린 타임에서 Frimit을 허용해 주세요'
        : '설정 > 사용 정보 접근에서 Frimit을 켜 주세요';
    case 'restricted':
      return '기기 정책으로 사용량 권한을 켤 수 없습니다';
    case 'unavailable':
      return '이 기기에서는 사용량을 읽을 수 없습니다';
  }
}
