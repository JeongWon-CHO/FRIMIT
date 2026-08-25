import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BackButton, OnboardingFrame, StepProgress } from '@/components/onboarding';
import { AppText, Avatar, GradientButton } from '@/components/ui';
import { colors, radius as radii } from '@/constants/design-tokens';
import { AVATAR_PRESETS } from '@/lib/avatars';
import { hexToRgba } from '@/lib/color';
import { markProgress } from '@/lib/onboarding';
import { useMyProfile, useUpdateProfile } from '@/hooks/use-profile';
import { DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH } from '@/lib/profile';

/**
 * 03 · 프로필.
 *
 * 프로필 행은 로그인 순간 서버 트리거가 이미 만들었고 닉네임에는 임시값('친구')이
 * 들어 있다. 그 값이 그대로인지가 "이 단계를 지났는가"의 판단 근거이므로
 * (`resolveEntryRoute`), 사용자가 그대로 두기로 했다면 기기에 표시를 남겨야 한다 —
 * 그러지 않으면 자기를 정말 '친구'라고 부르고 싶은 사람이 매번 이 화면을 다시 본다.
 *
 * 사용자가 손대기 전에는 상태를 들지 않는다. 서버 값을 상태로 복사해 두면 그 값이
 * 늦게 도착해서 "복사 시점"을 관리해야 하고, 사본과 서버 값이 어긋난 창이 생긴다.
 *
 * MY 탭에서도 같은 화면을 쓴다(`?edit=1`). 화면을 하나 더 만들 이유가 없다 —
 * 다른 것은 저장 뒤 갈 곳뿐이다. 온보딩에서는 다음 단계로 가고, 고치러 온
 * 사람은 왔던 자리로 돌아간다. 진행 표시도 그때는 거짓말이라 그리지 않는다.
 */
export default function ProfileSetupScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === '1';

  const profile = useMyProfile();
  const update = useUpdateProfile();

  const [draft, setDraft] = useState<{ nickname: string; avatarKey: string } | null>(null);

  const serverNickname =
    profile.data && profile.data.nickname !== DEFAULT_NICKNAME ? profile.data.nickname : '';
  const nickname = draft?.nickname ?? serverNickname;
  const avatarKey = draft?.avatarKey ?? profile.data?.avatar_key ?? 'avatar-01';

  const trimmed = nickname.trim();
  const tooLong = trimmed.length > NICKNAME_MAX_LENGTH;

  // 비워 두면 임시값을 그대로 쓴다. 이름 짓기를 강제할 이유가 없다.
  const nextNickname = trimmed.length > 0 ? trimmed : DEFAULT_NICKNAME;

  /*
   * 고치러 온 사람에게는 바뀐 게 없으면 저장을 잠근다. 누를 수 있게 두면 같은
   * 값을 서버에 한 번 더 쓰고 돌아가는데, 그건 저장이 아니라 취소다.
   *
   * 프로필이 아직 안 왔을 때도 잠근다 — 그때 입력칸은 비어 있고, 그대로 누르면
   * 서버에 있는 이름이 임시값으로 덮인다.
   */
  const unchanged =
    !profile.data ||
    (nextNickname === profile.data.nickname && avatarKey === profile.data.avatar_key);

  const save = async () => {
    await update.mutateAsync({ nickname: nextNickname, avatarKey });
    await markProgress({ nicknameDone: true });
    if (!editing) router.push('/notifications');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <OnboardingFrame
      footer={
        <GradientButton
          label={editing ? '저장' : '다음'}
          onPress={save}
          disabled={tooLong || (editing && unchanged)}
          loading={update.isPending}
        />
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          <BackButton />
          {!editing && <StepProgress total={4} current={1} />}
        </View>

        <AppText variant="screenTitle" style={styles.title}>
          {editing ? '닉네임과 아바타' : '어떻게 불러드릴까요?'}
        </AppText>
        <AppText variant="body" tone="muted">
          친구들에게 보이는 이름과 아바타예요.
        </AppText>

        <View style={styles.preview}>
          <Avatar
            id={profile.data?.id ?? 'me'}
            name={trimmed || DEFAULT_NICKNAME}
            emoji={AVATAR_PRESETS.find((preset) => preset.key === avatarKey)?.emoji}
            size={110}
            ring="activity"
          />
        </View>

        <TextInput
          value={nickname}
          onChangeText={(value) => setDraft({ nickname: value, avatarKey })}
          placeholder={DEFAULT_NICKNAME}
          placeholderTextColor={colors.text.placeholder}
          maxLength={NICKNAME_MAX_LENGTH + 4}
          autoCorrect={false}
          returnKeyType="done"
          style={styles.field}
          accessibilityLabel="닉네임"
        />
        {tooLong && (
          <AppText variant="metadata" tone="over">
            {NICKNAME_MAX_LENGTH}자를 넘었어요
          </AppText>
        )}

        <AppText variant="eyebrow" tone="faint">
          PRESET AVATAR
        </AppText>
        <View style={styles.presets}>
          {AVATAR_PRESETS.slice(0, 5).map((preset) => {
            const selected = preset.key === avatarKey;
            return (
              <Pressable
                key={preset.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={preset.key}
                onPress={() => setDraft({ nickname, avatarKey: preset.key })}
                style={[styles.preset, selected && styles.presetOn]}>
                <Avatar id={preset.key} emoji={preset.emoji} size={48} borderColor="transparent" />
              </Pressable>
            );
          })}
        </View>

        {update.error && (
          <AppText variant="metadata" tone="over">
            {update.error instanceof Error ? update.error.message : String(update.error)}
          </AppText>
        )}
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 14 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { 
    fontSize: 30,
    lineHeight: 38,
  },
  preview: { 
    alignItems: 'center',
    paddingVertical: 8,
  },
  field: {
    borderRadius: radii.button,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    borderWidth: 1,
    borderColor: hexToRgba(colors.accent.violetSoft, 0.3),
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  presets: { flexDirection: 'row', gap: 11 },
  preset: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.55,
    padding: 2,
  },
  presetOn: { borderColor: colors.accent.violetSoft, opacity: 1 },
});
