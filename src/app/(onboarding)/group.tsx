import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  AccentPicker,
  BackButton,
  StepProgress,
  NumericTimeSelector,
  OnboardingFrame,
  SHARED_TIME_DEFAULT,
} from '@/components/onboarding';
import { AppText, GradientButton } from '@/components/ui';
import { colors, radius as radii, type GroupAccentKey } from '@/constants/design-tokens';
import { useCreateGroup } from '@/hooks/use-groups';
import { hexToRgba } from '@/lib/color';

/**
 * 09 · 그룹 만들기. 두 단계가 한 라우트에 있다.
 *
 * 이름과 강조색이 1단계, **공동 시간이 2단계이자 이 화면의 주인공**이다. 서버
 * `create_group`은 처음부터 색과 한도를 인자로 받으므로 마이그레이션이 필요 없다.
 *
 * 강조색 키는 서버 제약이 `color-NN`이라 그대로 못 넣는다. 디자인의 세 이름과의
 * 대응은 `lib/today.ts`의 매핑 한 곳에만 둔다.
 */
const COLOR_KEY: Record<GroupAccentKey, string> = {
  violet: 'color-01',
  cyan: 'color-02',
  pink: 'color-03',
};

export default function CreateGroupScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState<GroupAccentKey>('violet');
  const [minutes, setMinutes] = useState(SHARED_TIME_DEFAULT);

  const create = useCreateGroup();
  const trimmed = name.trim();

  const submit = async () => {
    const group = await create.mutateAsync({
      name: trimmed,
      colorKey: COLOR_KEY[accent],
      dailyLimitSeconds: minutes * 60,
    });
    /*
     * 초대가 아니라 추적 선택이 먼저다.
     *
     * 초대는 공유 시트를 띄워 **온보딩에서 앱을 떠나는 유일한 지점**이다. 그
     * 뒤에 남은 단계가 있으면 카카오톡으로 넘어간 사람이 돌아오지 않고, 그러면
     * `is_ready`가 끝내 안 찍힌다. 시작에는 준비 2명이 필요하므로 친구가 들어와
     * 준비를 다 마쳐도 그룹이 시작되지 않는다 — 친구 쪽에서는 이유를 알 방법이
     * 없는 상태다.
     *
     * 그래서 혼자 할 수 있는 일을 전부 끝낸 뒤 대기실에서 초대한다. 거기서는
     * 떠나도 잃을 것이 없다.
     */
    router.push({ pathname: '/tracking', params: { groupId: group.id } });
  };

  return (
    <OnboardingFrame
      footer={
        step === 1 ? (
          <GradientButton label="다음" onPress={() => setStep(2)} disabled={trimmed.length === 0} />
        ) : (
          <>
            {create.error && (
              <AppText variant="metadata" tone="over">
                {create.error instanceof Error ? create.error.message : String(create.error)}
              </AppText>
            )}
            <GradientButton label="그룹 만들기" onPress={submit} loading={create.isPending} />
          </>
        )
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          {/* 2단계의 뒤로는 화면을 떠나는 것이 아니라 이름·색으로 돌아가는 것이다. */}
          <BackButton onPress={step === 2 ? () => setStep(1) : undefined} />
          {/* 화면 안의 2단계가 아니라 **그룹 흐름 전체**를 센다. 이 화면 둘,
              추적 하나, 준비 하나. 대기실은 내 일이 끝난 뒤라 세지 않는다. */}
          <StepProgress total={4} current={step} />
        </View>

        {step === 1 ? (
          <>
            <AppText variant="eyebrow" tone="faint">
              GROUP NAME
            </AppText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="밤샘 금지단"
              placeholderTextColor={colors.text.disabled}
              maxLength={20}
              autoCorrect={false}
              returnKeyType="done"
              style={styles.field}
              accessibilityLabel="그룹 이름"
            />

            <AppText variant="eyebrow" tone="faint" style={styles.accentLabel}>
              GROUP ACCENT
            </AppText>
            <AccentPicker value={accent} onChange={setAccent} />
          </>
        ) : (
          <NumericTimeSelector valueMinutes={minutes} onChange={setMinutes} />
        )}
      </View>

      <View />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 22 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  field: {
    borderRadius: radii.button,
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    borderWidth: 1,
    borderColor: hexToRgba(colors.accent.violetSoft, 0.3),
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  accentLabel: { marginTop: 4 },
});
