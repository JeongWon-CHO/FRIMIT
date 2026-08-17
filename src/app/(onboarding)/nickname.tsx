import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AvatarPicker } from '@/components/avatar';
import { Button } from '@/components/button';
import { OnboardingStep } from '@/components/onboarding-step';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useMyProfile, useUpdateProfile } from '@/hooks/use-profile';
import { markProgress } from '@/lib/onboarding';
import { DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH } from '@/lib/profile';

/**
 * 2단계 · 닉네임과 아바타.
 *
 * 프로필 행은 로그인 순간 서버 트리거가 이미 만들었고 닉네임에는 임시값('친구')이
 * 들어 있다. 그 값이 그대로 남아 있는지가 "이 단계를 지났는가"의 판단 근거이므로
 * (`resolveEntryRoute`), 사용자가 그대로 두기로 했다면 기기에 표시를 남겨야 한다 —
 * 그러지 않으면 자기를 '친구'라고 부르고 싶은 사람이 매번 이 화면을 다시 본다.
 */
export default function NicknameScreen() {
  const profile = useMyProfile();
  const update = useUpdateProfile();

  /**
   * 사용자가 손대기 전에는 상태가 없다.
   *
   * 서버 값을 상태로 복사해 두면 그 값이 늦게 도착하기 때문에 "복사 시점"을
   * 관리해야 하고(이미 타이핑을 시작했으면 덮어쓰지 않기), 사본과 서버 값이 어긋난
   * 창이 생긴다. 손대기 전까지는 서버 값을 그대로 그리고, 손댄 뒤에만 초안을 든다.
   */
  const [draft, setDraft] = useState<{ nickname: string; avatarKey: string } | null>(null);

  const serverNickname =
    profile.data && profile.data.nickname !== DEFAULT_NICKNAME ? profile.data.nickname : '';
  const nickname = draft?.nickname ?? serverNickname;
  const avatarKey = draft?.avatarKey ?? profile.data?.avatar_key ?? 'avatar-01';

  const trimmed = nickname.trim();
  const tooLong = trimmed.length > NICKNAME_MAX_LENGTH;

  const save = async () => {
    await update.mutateAsync({
      // 비워 두면 임시값을 그대로 쓴다. 이름 짓기를 강제할 이유가 없다.
      nickname: trimmed.length > 0 ? trimmed : DEFAULT_NICKNAME,
      avatarKey,
    });
    await markProgress({ nicknameDone: true });
    router.push('/permission');
  };

  return (
    <OnboardingStep
      step="nickname"
      eyebrow="프로필"
      title="친구들에게 어떻게 보일까요"
      description="같은 그룹 친구들에게는 이 이름과 아바타만 보여요."
      footer={
        <Button
          label="다음"
          onPress={save}
          disabled={tooLong}
          loading={update.isPending}
        />
      }>
      <TextField
        label="닉네임"
        value={nickname}
        onChangeText={(value) => setDraft({ nickname: value, avatarKey })}
        placeholder={DEFAULT_NICKNAME}
        maxLength={NICKNAME_MAX_LENGTH + 4}
        autoCorrect={false}
        returnKeyType="done"
        hint={`${NICKNAME_MAX_LENGTH}자까지, 비워 두면 '${DEFAULT_NICKNAME}'으로 시작해요`}
        error={tooLong ? `${NICKNAME_MAX_LENGTH}자를 넘었어요` : null}
      />

      <View>
        <ThemedText type="label" themeColor="textSecondary">
          아바타
        </ThemedText>
      </View>
      <AvatarPicker value={avatarKey} onChange={(key) => setDraft({ nickname, avatarKey: key })} />

      {update.error ? (
        <ThemedText type="small" themeColor="over">
          {update.error instanceof Error ? update.error.message : String(update.error)}
        </ThemedText>
      ) : null}
    </OnboardingStep>
  );
}
