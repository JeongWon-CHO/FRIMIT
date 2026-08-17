import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { OnboardingStep } from '@/components/onboarding-step';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useCreateGroup, useJoinGroup } from '@/hooks/use-groups';
import { useTheme } from '@/hooks/use-theme';

/**
 * 4단계 · 그룹.
 *
 * 만들기와 참여가 한 화면에 있다. 초대 링크를 받고 온 사람은 참여를, 처음 시작하는
 * 사람은 만들기를 하는데, 둘을 다른 화면으로 갈라 놓으면 링크를 받은 사람이 굳이
 * 빈 그룹을 하나 만들고 나서 참여하는 일이 생긴다.
 *
 * 서버 쪽 규칙(이름 1~20자, 최대 5개 그룹, 초대 코드 유효성)은 RPC가 검사한다.
 * 여기서 막는 것은 빈 입력처럼 왕복이 아까운 것들뿐이다.
 */
export default function GroupScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const create = useCreateGroup();
  const join = useJoinGroup();
  const pending = create.isPending || join.isPending;
  const failure = create.error ?? join.error;

  const submit = async () => {
    if (mode === 'create') {
      await create.mutateAsync(name.trim());
    } else {
      await join.mutateAsync(code.trim().toUpperCase());
    }
    router.push('/tracking');
  };

  const canSubmit = mode === 'create' ? name.trim().length > 0 : code.trim().length === 6;

  return (
    <OnboardingStep
      step="group"
      eyebrow="그룹"
      title={mode === 'create' ? '누구와 함께할까요' : '초대 코드를 받았나요'}
      description={
        mode === 'create'
          ? '그룹을 만들면 초대 코드가 나와요. 친구에게 보내 주세요.'
          : '친구가 보낸 6자리 코드를 넣어 주세요.'
      }
      footer={
        <Button
          label={mode === 'create' ? '그룹 만들기' : '그룹에 참여하기'}
          onPress={submit}
          disabled={!canSubmit}
          loading={pending}
        />
      }>
      <View style={[styles.switch, { backgroundColor: theme.backgroundElement }]}>
        <SwitchOption
          label="만들기"
          active={mode === 'create'}
          onPress={() => setMode('create')}
        />
        <SwitchOption label="참여하기" active={mode === 'join'} onPress={() => setMode('join')} />
      </View>

      {mode === 'create' ? (
        <TextField
          label="그룹 이름"
          value={name}
          onChangeText={setName}
          placeholder="예: 도서관 3층"
          maxLength={24}
          autoCorrect={false}
          returnKeyType="done"
          hint="20자까지. 나중에 바꿀 수 있어요"
        />
      ) : (
        <TextField
          label="초대 코드"
          value={code}
          onChangeText={(value) => setCode(value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          mono
          hint="6자리"
        />
      )}

      {failure ? (
        <ThemedText type="small" themeColor="over">
          {failure instanceof Error ? failure.message : String(failure)}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        공동 한도는 하루 2시간으로 시작해요. 시작한 뒤에 바꾸려면 그룹원 전원이 동의해야 하고,
        다음 오전 6시에 적용돼요.
      </ThemedText>
    </OnboardingStep>
  );
}

function SwitchOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.switchOption, active && { backgroundColor: theme.surface }]}>
      <ThemedText type="smallBold" themeColor={active ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    padding: Spacing.half,
    borderRadius: Radius.control,
    gap: Spacing.half,
  },
  switchOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.control - 2,
  },
});
