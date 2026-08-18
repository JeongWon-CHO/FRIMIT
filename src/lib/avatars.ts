/**
 * 프리셋 아바타.
 *
 * 사용자 업로드 이미지는 MVP 범위 밖이다(plan.md 94행: 신고·검수 부담을 지지
 * 않기 위한 결정). 이미지 파일 대신 이모지를 쓰므로 에셋도 늘지 않는다.
 *
 * 키는 서버의 `avatar_key_format` 제약(`^avatar-[0-9]{2}$`)을 따른다.
 *
 * 이 표만 따로 떼어 둔 이유는 **네트워크에 닿지 않기 때문**이다. `profile.ts`는
 * supabase를 들고 있어서 화면 로직 테스트에서 react-native까지 끌고 들어온다.
 */
export const AVATAR_PRESETS = [
  { key: 'avatar-01', emoji: '🐣' },
  { key: 'avatar-02', emoji: '🦊' },
  { key: 'avatar-03', emoji: '🐧' },
  { key: 'avatar-04', emoji: '🐢' },
  { key: 'avatar-05', emoji: '🦉' },
  { key: 'avatar-06', emoji: '🐙' },
  { key: 'avatar-07', emoji: '🦔' },
  { key: 'avatar-08', emoji: '🐝' },
] as const;

export function avatarEmoji(avatarKey: string): string {
  return AVATAR_PRESETS.find((preset) => preset.key === avatarKey)?.emoji ?? '🐣';
}
