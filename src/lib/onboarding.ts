import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_NICKNAME, fetchMyProfile } from './profile';
import { getSessionUserId } from './supabase';
import { readPermission } from './tracking';

/**
 * 앱을 켰을 때 어디로 보낼지 판정한다.
 *
 * 온보딩 진행 상태를 서버에 컬럼으로 두지 않았다. 대신 **이미 있는 사실에서
 * 되짚는다** — 닉네임이 임시값인가, 권한을 물어본 적 있는가. 이유는 온보딩의
 * 절반이 기기 쪽 사실이라는 것이다. 권한은 기기마다 다시 물어야 하므로, 계정에
 * "완료" 도장을 찍어 두면 폰을 바꾼 사람이 아무것도 집계되지 않는 채로 오늘
 * 화면에 들어간다.
 *
 * 되짚기로 알 수 없는 것은 딱 하나, **사용자가 일부러 건너뛴 단계**다. 그것만
 * 기기에 적어 둔다. 이 값이 없으면 시트를 닫은 사용자를 같은 화면에 영원히
 * 되돌려 보내게 된다(iOS 권한 시트를 취소하면 상태가 `notDetermined`로 남는다).
 *
 * **그룹은 여기서 세지 않는다.** 온보딩은 계정에 한 번 하는 일(프로필·권한)까지고,
 * 그룹 만들기는 홈에서 시작하는 별개의 흐름이다. 예전에는 그룹이 없으면 07로
 * 보냈는데, 그래서 온보딩이 끝난 줄 알았던 사람 앞에 퍼널이 하나 더 열렸다.
 * 그룹 없는 상태는 어차피 다뤄야 한다 — 마지막 그룹에서 나오면 그 상태가 된다.
 */

/**
 * 진행 기록은 **계정별로** 따로 둔다.
 *
 * 한 기기에 계정 하나뿐이라면 접두사만으로 충분했다. 하지만 로그아웃과 계정
 * 삭제가 있는 지금은 같은 기기에서 사람이 바뀔 수 있고, 그때 기록 하나를 같이
 * 쓰면 **앞 사람이 지난 단계를 뒷사람이 건너뛴다.** 실제로 그랬다 — 개발용
 * 익명 계정으로 온보딩을 마친 기기에서 Apple로 처음 로그인하니 `nicknameDone`이
 * 이미 true라 닉네임 화면을 건너뛰고 닉네임이 '친구'로 남았다.
 *
 * 권한 건너뛰기는 사실 기기 쪽 사실에 가까워서 계정을 옮길 때 같이 물려도
 * 됐지만, 나누지 않는다. 계정이 바뀌면 그 사람은 이 앱을 처음 쓰는 것이고,
 * 무엇을 건너뛸지는 그 사람이 정할 일이다.
 */
const PROGRESS_PREFIX = 'frimit.onboarding.v1';

/**
 * 세션이 없을 때 접두사만 쓰는 이유: 그 상태에서 기록을 읽는 경로는 로그인 전
 * 되짚기뿐이고, 거기서는 값이 무엇이든 소개 화면으로 간다. 던지지 않고 빈
 * 기록을 돌려주는 편이 조용하다.
 */
async function progressKey(): Promise<string> {
  const userId = await getSessionUserId();
  return userId ? `${PROGRESS_PREFIX}:${userId}` : PROGRESS_PREFIX;
}

export type OnboardingProgress = {
  /** 닉네임 단계를 지났다. 자기를 정말 '친구'라고 부르고 싶은 사람을 위해 필요하다. */
  nicknameDone: boolean;
  /** 알림 사전 설명을 봤다. 켰든 넘겼든 다시 보여주지 않는다. */
  notificationsSeen: boolean;
  /** 권한을 나중에 하기로 했다. */
  permissionSkipped: boolean;
};

const EMPTY_PROGRESS: OnboardingProgress = {
  nicknameDone: false,
  notificationsSeen: false,
  permissionSkipped: false,
};

export async function readProgress(): Promise<OnboardingProgress> {
  const raw = await AsyncStorage.getItem(await progressKey());
  if (!raw) return EMPTY_PROGRESS;

  try {
    return { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Partial<OnboardingProgress>) };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export async function markProgress(patch: Partial<OnboardingProgress>): Promise<void> {
  const next = { ...(await readProgress()), ...patch };
  await AsyncStorage.setItem(await progressKey(), JSON.stringify(next));
}

/** 개발 중 온보딩을 다시 보려면 MY 탭에서 이걸 부른다. */
export async function resetProgress(): Promise<void> {
  await AsyncStorage.removeItem(await progressKey());
}

/** 온보딩 라우트. `(onboarding)` 그룹은 경로에 나타나지 않는다. */
export const OnboardingRoutes = {
  welcome: '/welcome',
  signIn: '/sign-in',
  nickname: '/nickname',
  notifications: '/notifications',
  privacy: '/privacy',
  permission: '/permission',
  start: '/start',
  group: '/group',
  tracking: '/tracking',
  ready: '/ready',
  started: '/started',
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
 *
 * 세션 확인이 맨 앞에 있어야 한다. 아래의 되짚기는 전부 서버에 묻는 일이고,
 * 로그인하지 않은 사람에게는 물어볼 것 자체가 없다. 예전에는 `fetchMyProfile()`이
 * 세션이 없으면 **익명 계정을 하나 만들어서** 이 판정을 이어 갔다 — 그래서 앱을
 * 처음 켜는 사람은 소개 화면을 보기도 전에 계정이 생겼다.
 */
export async function resolveEntryRoute(): Promise<EntryRoute> {
  if (!(await getSessionUserId())) return OnboardingRoutes.welcome;
  return resolveRouteForSignedIn();
}

/**
 * 로그인 직후 어디로 보낼지.
 *
 * 되짚기를 그대로 쓰되 한 가지만 다르다 — 결과가 소개 화면(01)이면 닉네임(03)으로
 * 바꿔 보낸다. 되짚기가 01을 가리키는 유일한 이유는 "닉네임이 아직 임시값"인데,
 * 방금 02에서 로그인한 사람에게 01을 다시 보여주면 소개 → 로그인 → 소개로 도는
 * 것처럼 보인다.
 *
 * 기기를 바꾼 사람은 여기서 자기 자리로 곧장 간다. 닉네임은 이미 서버에 있으므로
 * 되짚기가 오늘 화면이나 남은 권한 단계를 가리킨다.
 */
export async function resolveRouteAfterSignIn(): Promise<EntryRoute> {
  const route = await resolveRouteForSignedIn();
  return route === OnboardingRoutes.welcome ? OnboardingRoutes.nickname : route;
}

async function resolveRouteForSignedIn(): Promise<EntryRoute> {
  const progress = await readProgress();
  const profile = await fetchMyProfile();

  const needsNickname = !progress.nicknameDone && profile.nickname === DEFAULT_NICKNAME;
  if (needsNickname) return OnboardingRoutes.welcome;

  /*
   * 권한은 거부해도 앱 탐색을 막지 않는다(plan.md 71행). 그래서 막는 조건은
   * "거부"가 아니라 "한 번도 물어보지 않았다"다.
   *
   * 그룹 없이 읽는다. 예전에는 `readTrackingState(groups[0].id)`로 읽느라 이
   * 판정이 그룹 뒤에 있어야 했는데, 권한은 기기 하나에 하나뿐이라 그룹과 무관하다.
   */
  if (readPermission() === 'notDetermined' && !progress.permissionSkipped) {
    // 권한 화면에 바로 떨구지 않는다. 05가 권한을 얻어 내는 화면이고, 그걸
    // 건너뛰면 사용자는 이유를 모른 채 시스템 시트를 만난다.
    return progress.notificationsSeen ? OnboardingRoutes.privacy : OnboardingRoutes.notifications;
  }

  return TABS_ROUTE;
}
