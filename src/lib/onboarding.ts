import AsyncStorage from '@react-native-async-storage/async-storage';

import { listMyGroups } from './groups';
import { DEFAULT_NICKNAME, fetchMyProfile } from './profile';
import { readTrackingState } from './tracking';

/**
 * 앱을 켰을 때 어디로 보낼지 판정한다.
 *
 * 온보딩 진행 상태를 서버에 컬럼으로 두지 않았다. 대신 **이미 있는 사실에서
 * 되짚는다** — 닉네임이 임시값인가, 권한을 물어본 적 있는가, 그룹이 있는가,
 * 추적 대상을 골랐는가. 이유는 온보딩의 절반이 기기 쪽 사실이라는 것이다.
 * 권한과 추적 대상 선택은 기기마다 다시 해야 하므로, 계정에 "완료" 도장을 찍어
 * 두면 폰을 바꾼 사람이 아무것도 집계되지 않는 채로 오늘 화면에 들어간다.
 *
 * 되짚기로 알 수 없는 것은 딱 하나, **사용자가 일부러 건너뛴 단계**다. 그것만
 * 기기에 적어 둔다. 이 값이 없으면 시트를 닫은 사용자를 같은 화면에 영원히
 * 되돌려 보내게 된다(iOS 권한 시트를 취소하면 상태가 `notDetermined`로 남는다).
 */

const PROGRESS_KEY = 'frimit.onboarding.v1';

export type OnboardingProgress = {
  /** 닉네임 단계를 지났다. 자기를 정말 '친구'라고 부르고 싶은 사람을 위해 필요하다. */
  nicknameDone: boolean;
  /** 권한을 나중에 하기로 했다. */
  permissionSkipped: boolean;
  /** 추적 대상 선택을 나중에 하기로 했다. */
  trackingSkipped: boolean;
  /** 온보딩을 끝까지 봤다. */
  done: boolean;
};

const EMPTY_PROGRESS: OnboardingProgress = {
  nicknameDone: false,
  permissionSkipped: false,
  trackingSkipped: false,
  done: false,
};

export async function readProgress(): Promise<OnboardingProgress> {
  const raw = await AsyncStorage.getItem(PROGRESS_KEY);
  if (!raw) return EMPTY_PROGRESS;

  try {
    return { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Partial<OnboardingProgress>) };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export async function markProgress(patch: Partial<OnboardingProgress>): Promise<void> {
  const next = { ...(await readProgress()), ...patch };
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
}

/** 개발 중 온보딩을 다시 보려면 MY 탭에서 이걸 부른다. */
export async function resetProgress(): Promise<void> {
  await AsyncStorage.removeItem(PROGRESS_KEY);
}

/** 온보딩 라우트. `(onboarding)` 그룹은 경로에 나타나지 않는다. */
export const OnboardingRoutes = {
  welcome: '/welcome',
  nickname: '/nickname',
  permission: '/permission',
  group: '/group',
  tracking: '/tracking',
  ready: '/ready',
} as const;

export const TABS_ROUTE = '/';

export type EntryRoute =
  | (typeof OnboardingRoutes)[keyof typeof OnboardingRoutes]
  | typeof TABS_ROUTE;

/**
 * 첫 화면을 정한다.
 *
 * 순서는 plan.md 3장의 온보딩 순서를 따른다(푸시 권한 단계는 아직 없다).
 * 각 단계는 "아직 안 된 일"이 있을 때만 멈춘다 — 이미 된 일은 조용히 지나간다.
 */
export async function resolveEntryRoute(): Promise<EntryRoute> {
  const progress = await readProgress();
  const [profile, groups] = await Promise.all([fetchMyProfile(), listMyGroups()]);

  const needsNickname = !progress.nicknameDone && profile.nickname === DEFAULT_NICKNAME;
  if (needsNickname) return OnboardingRoutes.welcome;

  // 그룹이 없으면 오늘 화면에 그릴 것이 없다. 온보딩을 끝낸 사람이 여기 걸리는
  // 경우도 있다 — 마지막 그룹에서 탈퇴하면 그렇다. 그때는 소개를 다시 보여주지
  // 않고 그룹 단계로 바로 보낸다.
  if (groups.length === 0) return OnboardingRoutes.group;

  if (progress.done) return TABS_ROUTE;

  // 권한은 거부해도 앱 탐색을 막지 않는다(plan.md 71행). 그래서 막는 조건은
  // "거부"가 아니라 "한 번도 물어보지 않았다"다.
  const tracking = readTrackingState(groups[0].id);
  if (tracking.permission === 'notDetermined' && !progress.permissionSkipped) {
    return OnboardingRoutes.permission;
  }

  if (tracking.permission === 'granted' && tracking.selectionCount === 0 && !progress.trackingSkipped) {
    return OnboardingRoutes.tracking;
  }

  return OnboardingRoutes.ready;
}
