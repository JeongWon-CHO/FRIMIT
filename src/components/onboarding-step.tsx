import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 온보딩 한 단계의 틀.
 *
 * 단계에 번호를 붙인 것은 장식이 아니다. 이 여섯 개는 실제로 순서가 있는 절차이고
 * (권한 없이 대상을 고를 수 없고, 그룹 없이 준비할 수 없다) 앞으로 몇 개가 남았는지가
 * 사용자가 알고 싶어 하는 정보다. 순서가 없는 목록에는 번호를 붙이지 않는다.
 */

/** 진행 표시의 분모. plan.md 3장의 8단계에서 로그인·푸시 두 단계를 뺀 순서다. */
export const ONBOARDING_SEQUENCE = [
  'welcome',
  'nickname',
  'permission',
  'group',
  'tracking',
  'ready',
] as const;

export type OnboardingStepName = (typeof ONBOARDING_SEQUENCE)[number];

type OnboardingStepProps = {
  step: OnboardingStepName;
  title: string;
  /** 제목 위 한 줄. 이 단계가 무엇에 관한 것인지 한 단어로. */
  eyebrow: string;
  /** 제목 아래 설명. 왜 이걸 하는지 적는다 — 무엇을 하는지는 제목이 이미 말했다. */
  description?: string;
  children?: ReactNode;
  footer: ReactNode;
};

export function OnboardingStep({
  step,
  title,
  eyebrow,
  description,
  children,
  footer,
}: OnboardingStepProps) {
  const index = ONBOARDING_SEQUENCE.indexOf(step);

  return (
    <Screen footer={footer}>
      <View style={styles.header}>
        <BackButton />
        <StepTrail index={index} />

        <ThemedText type="label" themeColor="accent">
          {eyebrow}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.title}>
          {title}
        </ThemedText>
        {description ? (
          <ThemedText type="default" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>

      {children}
    </Screen>
  );
}

/**
 * 뒤로 가기.
 *
 * **돌아갈 곳이 있을 때만 그린다.** 진입 판정이 중간 단계를 첫 화면으로 띄우는
 * 경우가 있어서(`router.replace`) 단계 번호만 보고 그리면 눌러도 아무 일 없는
 * 버튼이 생긴다. 그건 화면이 고장 난 것처럼 보인다.
 */
function BackButton() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();

  if (!navigation.canGoBack()) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로"
      onPress={() => router.back()}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="chevron-back" size={24} color={theme.text} />
    </Pressable>
  );
}

/** 지나온 단계는 채워지고, 지금은 길어지고, 남은 것은 비어 있다. */
function StepTrail({ index }: { index: number }) {
  const theme = useTheme();

  return (
    <View
      style={styles.trail}
      accessibilityRole="progressbar"
      accessibilityLabel={`${index + 1}단계 중 ${ONBOARDING_SEQUENCE.length}단계`}>
      {ONBOARDING_SEQUENCE.map((name, position) => (
        <View
          key={name}
          style={[
            styles.tick,
            position === index && styles.tickCurrent,
            {
              backgroundColor:
                position <= index ? theme.accent : theme.backgroundSelected,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  title: {
    // 32pt 제목에 44 줄높이는 두 줄이 됐을 때 벌어져 보인다.
    lineHeight: 38,
  },
  back: {
    // 44는 애플이 권하는 최소 터치 영역이다. 아이콘만 24로 그리고 나머지는 여백이다.
    width: 44,
    height: 44,
    marginLeft: -Spacing.two,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  trail: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  tick: {
    width: 12,
    height: 4,
    borderRadius: Radius.pill,
  },
  tickCurrent: {
    width: 28,
  },
});
