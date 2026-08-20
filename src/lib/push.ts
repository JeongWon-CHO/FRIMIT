import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * 푸시 권한과 토큰.
 *
 * 이 파일이 하는 일은 둘뿐이다 — OS에 권한을 묻고, 받은 Expo 토큰을 내 기기 행에
 * 적는다. 무엇을 언제 보낼지는 서버가 정한다(`activity_events`).
 *
 * **여기서는 아무것도 던지지 않는다.** 푸시는 이 앱의 부가 기능이고, 시뮬레이터·
 * 권한 거부·프로젝트 미설정 같은 이유로 토큰이 없는 상태는 정상이다. 그때마다
 * 온보딩이 멈추거나 동기화가 실패하면 본체가 부가 기능에 인질로 잡힌다.
 */

/**
 * 알림이 도착했을 때의 표시 정책. 모듈이 실려 있는 동안 한 번만 정해지면 된다.
 *
 * 소리를 켜지 않는다. 하루에 몇 번뿐이라 해도, 스크린타임을 줄이자는 앱이
 * 소리로 사람을 부르는 것은 앞뒤가 맞지 않는다. 배지도 마찬가지다 — 읽지 않은
 * 숫자는 앱을 열게 만드는 장치다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/**
 * 프로젝트 id. Expo 푸시 토큰은 이 값 없이는 발급되지 않는다(SDK 50+).
 *
 * `eas init`을 돌리기 전까지는 비어 있다. 그 상태에서 토큰을 요청하면 예외가
 * 나므로 미리 확인하고 조용히 물러난다.
 */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function readPushPermission(): Promise<PushPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PushPermission;
}

/**
 * 권한을 묻는다. 이미 허용돼 있으면 시스템 시트를 다시 띄우지 않는다.
 *
 * iOS는 한 번 거절당하면 앱에서 다시 물을 수 없다. 그래서 온보딩의 사전 설명
 * 화면이 있는 것이고(PERMISSION_FLOW_SPEC), 여기서는 그 뒤를 이을 뿐이다.
 */
export async function requestPushPermission(): Promise<PushPermission> {
  const existing = await readPushPermission();
  if (existing === 'granted') return existing;

  const { status } = await Notifications.requestPermissionsAsync();
  return status as PushPermission;
}

/**
 * Expo 푸시 토큰을 받아 기기 행에 적는다. 실패는 null로 돌아온다.
 *
 * Android 13+는 채널을 먼저 만들어야 토큰이 나온다(SDK 57 문서). 채널을 만드는
 * 일이 권한을 요청하지는 않으므로 순서를 지키기만 하면 된다.
 */
export async function registerPushToken(deviceId: string): Promise<string | null> {
  // 시뮬레이터에는 푸시가 없다. 여기서 걸러 두면 개발 중에 매번 예외를 본다.
  if (!Device.isDevice) return null;

  const id = projectId();
  if (!id) return null;

  if ((await readPushPermission()) !== 'granted') return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '기본',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#7C4DFF',
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;

    const { error } = await supabase
      .from('devices')
      .update({ expo_push_token: token })
      .eq('id', deviceId);

    if (error) return null;
    return token;
  } catch {
    // 네트워크가 없거나 프로젝트 설정이 아직 없을 때가 여기다. 다음 실행에서
    // 다시 시도된다 — 이 함수는 앱이 앞으로 나올 때마다 불린다.
    return null;
  }
}

/** 푸시가 실제로 가능한 상태인가. MY 탭의 상태 줄이 쓴다. */
export async function isPushReady(): Promise<boolean> {
  return Device.isDevice && Boolean(projectId()) && (await readPushPermission()) === 'granted';
}
