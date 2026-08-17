import { router } from 'expo-router';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PoolBar } from '@/components/pool-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { MemberHues, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 1단계 · 가치 소개.
 *
 * 문장으로 "공동 스크린타임 풀"을 설명하는 대신 **작동하는 것을 그대로 보여준다.**
 * 아래 바는 오늘 화면에 실제로 나올 그 컴포넌트이고, 숫자만 예시다. 이 제품에서
 * 새로 배워야 하는 개념은 하나뿐이니(내 한도가 아니라 우리 한도) 그 하나를
 * 그림으로 먼저 보여주는 편이 빠르다.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const hues = MemberHues[scheme];

  return (
    <Screen
      footer={
        <Button label="시작하기" onPress={() => router.push('/nickname')} />
      }>
      <View style={styles.hero}>
        <ThemedText type="label" themeColor="accent">
          FRIMIT
        </ThemedText>
        <ThemedText type="title" style={styles.headline}>
          시간은{'\n'}같이 쓰는 것
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          친구들과 하루 스크린타임 한도를 하나로 묶어요. 내가 많이 쓰면 친구가 쓸 시간이
          줄어들고, 친구가 아끼면 내 시간이 늘어나요.
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          예시 · 우리 그룹의 오늘
        </ThemedText>

        <View style={styles.exampleHeadline}>
          <ThemedText type="display">42</ThemedText>
          <ThemedText type="metric" themeColor="textSecondary">
            분 남음
          </ThemedText>
        </View>

        <PoolBar
          segments={[
            { id: 'a', seconds: 2900, color: theme.accent },
            { id: 'b', seconds: 2400, color: hues[1] },
            { id: 'c', seconds: 1180, color: hues[2] },
          ]}
          limitSeconds={9000}
          overSeconds={0}
          height={18}
        />

        <ThemedText type="small" themeColor="textSecondary">
          한 칸이 한 사람이에요. 색이 진한 칸이 나예요. 누가 1등인지는 아무도 안 세요.
        </ThemedText>
      </Card>

      <View style={styles.rules}>
        <Rule text="하루는 오전 6시에 새로 시작해요." />
        <Rule text="한도를 넘겨도 앱을 막지 않아요. 넘긴 시간만 따로 보여요." />
        <Rule text="어떤 앱을 썼는지는 친구에게 보이지 않아요. 합계 시간만 보여요." />
      </View>
    </Screen>
  );
}

/** 규칙 셋. 순서가 없으므로 번호를 붙이지 않고 점으로만 잇는다. */
function Rule({ text }: { text: string }) {
  const theme = useTheme();

  return (
    <View style={styles.rule}>
      <View style={[styles.dot, { backgroundColor: theme.accent }]} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.ruleText}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.two,
    paddingTop: Spacing.five,
  },
  headline: {
    // 48pt에 52 줄높이는 두 줄에서 붙어 보인다. 한글은 라틴보다 세로로 꽉 찬다.
    lineHeight: 56,
    letterSpacing: -1.5,
  },
  exampleHeadline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  rules: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 7,
  },
  ruleText: {
    flexShrink: 1,
  },
});
