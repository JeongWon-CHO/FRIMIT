import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Bloom, Surface } from '@/components/ui';
import { colors } from '@/constants/design-tokens';

/**
 * 07의 두 갈래 — 만들기와 참여하기.
 *
 * **두 카드를 같게 만들지 않는다.** 크기와 빛의 차이가 곧 추천이다. 처음 시작하는
 * 사람에게는 만들기가, 코드를 받고 온 사람에게는 참여가 맞는데 후자는 이미 무엇을
 * 할지 알고 온다. 그래서 큰 쪽이 만들기다.
 */
export function ChoiceCard({
  title,
  caption,
  emphasis,
  figure,
  onPress,
}: {
  title: string;
  caption: string;
  emphasis: 'primary' | 'secondary';
  figure: ReactNode;
  onPress: () => void;
}) {
  const primary = emphasis === 'primary';

  return (
    <Surface
      fill={primary ? ['#16162A', '#0A0A11'] : '#0E1016'}
      border={primary ? colors.border.violet : colors.border.hairlineStrong}
      cornerRadius={30}
      padding={22}
      onPress={onPress}
      style={{ height: primary ? 250 : 210, justifyContent: 'space-between' }}
      bloom={
        primary ? (
          <Bloom color={colors.accent.violet} size={280} opacity={0.55} x={280} y={10} />
        ) : (
          <Bloom color={colors.accent.cyan} size={240} opacity={0.3} x={40} y={190} />
        )
      }>
      <View style={styles.figure}>{figure}</View>

      <View style={styles.text}>
        <AppText variant="greeting" style={primary ? undefined : styles.secondaryTitle}>
          {title}
        </AppText>
        <AppText variant="body" tone="muted">
          {caption}
        </AppText>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  figure: { alignItems: 'flex-start' },
  text: { gap: 4 },
  secondaryTitle: { fontSize: 22, lineHeight: 28 },
});
