import { AVATAR_PRESETS, avatarEmoji } from './avatars';
import { ensureSession, supabase } from './supabase';

/**
 * 내 프로필 읽기·쓰기.
 *
 * `profiles` 행은 로그인 순간 서버 트리거(`handle_new_user`)가 이미 만들어 둔다.
 * 그래서 여기에 insert 경로가 없다 — 온보딩이 하는 일은 만드는 게 아니라 임시
 * 닉네임을 사용자가 정한 값으로 바꾸는 것이다.
 */

/**
 * 트리거가 넣는 임시 닉네임. 서버의 `handle_new_user`와 같은 값이어야 한다.
 *
 * 이 값이 그대로 남아 있다는 것은 "아직 닉네임을 정하지 않았다"는 뜻이고,
 * 온보딩이 그 판단에 쓴다(`onboarding.ts`). 서버 쪽을 바꾸면 여기도 바꿔야 한다.
 */
export const DEFAULT_NICKNAME = '친구';

export const NICKNAME_MAX_LENGTH = 20;

/** 아바타 표는 네트워크에 닿지 않는 `avatars.ts`에 있다. 여기서 다시 내보낸다. */
export { AVATAR_PRESETS, avatarEmoji };

export type Profile = {
  id: string;
  nickname: string;
  avatar_key: string;
  locale: string;
};

/** 내 프로필. 세션이 없으면 익명으로 하나 만든 뒤 읽는다. */
export async function fetchMyProfile(): Promise<Profile> {
  const profileId = await ensureSession();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_key, locale')
    .eq('id', profileId)
    .single();

  if (error) throw new Error(`프로필을 읽지 못했습니다: ${error.message}`);
  return data as Profile;
}

export async function updateMyProfile(input: {
  nickname: string;
  avatarKey: string;
}): Promise<Profile> {
  const profileId = await ensureSession();
  const nickname = input.nickname.trim();

  // 서버도 같은 것을 검사하지만(nickname_length), 거기서 걸리면 사용자에게는
  // Postgres 오류 문장이 그대로 보인다. 길이 규칙은 양쪽에 둔다.
  if (nickname.length < 1 || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new Error(`닉네임은 1자 이상 ${NICKNAME_MAX_LENGTH}자 이하여야 합니다.`);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ nickname, avatar_key: input.avatarKey })
    .eq('id', profileId)
    .select('id, nickname, avatar_key, locale')
    .single();

  if (error) throw new Error(`프로필을 저장하지 못했습니다: ${error.message}`);
  return data as Profile;
}
