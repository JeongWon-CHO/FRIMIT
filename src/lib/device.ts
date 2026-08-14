import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import type { PermissionState } from '@modules/screen-time';

/**
 * 이 설치본이 서버에서 갖는 기기 행을 보장한다.
 *
 * 기기 id를 **로컬에 적어 두는 것이 핵심**이다. "내 계정의 활성 기기"를 조회해
 * 재사용하면, 폰 두 대를 쓰는 사람의 두 번째 폰이 첫 번째 폰의 행을 자기 것으로
 * 착각한다. 그러면 두 기기의 사용량이 한 줄에 섞여 들어간다.
 *
 * 매번 is_active를 켜는 이유는 plan.md의 "계정당 활성 집계 기기 1대, 새 기기
 * 등록 시 이전 기기 비활성화" 규칙 때문이다. 지금 손에 들고 있는 폰이 활성
 * 기기이며, 서버의 트리거가 나머지를 알아서 내린다.
 */

const DEVICE_ID_KEY = 'frimit.device.id';

function currentPlatform(): 'ios' | 'android' {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export async function ensureDevice(permissionState: PermissionState): Promise<string> {
  const storedId = await AsyncStorage.getItem(DEVICE_ID_KEY);

  if (storedId) {
    const { data, error } = await supabase
      .from('devices')
      .update({ is_active: true, permission_state: permissionState })
      .eq('id', storedId)
      .select('id')
      .maybeSingle();

    if (error) throw new Error(`기기 정보를 갱신하지 못했습니다: ${error.message}`);
    if (data) return data.id;

    // 서버에 없는 id다. 계정을 지웠다가 다시 만든 경우이므로 새로 등록한다.
    await AsyncStorage.removeItem(DEVICE_ID_KEY);
  }

  const { data: session } = await supabase.auth.getSession();
  const profileId = session.session?.user.id;
  if (!profileId) throw new Error('로그인 세션이 없어 기기를 등록할 수 없습니다.');

  const { data, error } = await supabase
    .from('devices')
    .insert({
      profile_id: profileId,
      platform: currentPlatform(),
      permission_state: permissionState,
    })
    .select('id')
    .single();

  if (error) throw new Error(`기기를 등록하지 못했습니다: ${error.message}`);

  await AsyncStorage.setItem(DEVICE_ID_KEY, data.id);
  return data.id;
}

/** 로그아웃·계정 삭제 후 다음 실행이 새 기기로 등록되게 한다. */
export async function forgetDevice(): Promise<void> {
  await AsyncStorage.removeItem(DEVICE_ID_KEY);
}
