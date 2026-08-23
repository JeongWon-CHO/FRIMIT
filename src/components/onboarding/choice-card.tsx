import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Bloom, Surface } from '@/components/ui';
import { colors } from '@/constants/design-tokens';

/**
 * 07의 두 갈래 — 만들기와 참여하기.
 *
 * 추천은 **빛으로만** 한다. 예전에는 크기도 달랐는데(250 대 210), 두 장이 나란히
 * 놓인 자리에서 높이가 어긋나면 추천으로 읽히기보다 정렬이 안 맞은 것으로 보인다.
 * 표면·테두리·블룸의 차이가 이미 어느 쪽이 기본인지 말한다.
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
      padding={18}
      onPress={onPress}
      // 두 장이 같은 높이다. 예전 250·210은 제목까지 더하면 화면을 넘겨서,
      // 갈림길에서 두 갈래를 한눈에 못 보고 스크롤로 찾아야 했다.
      style={{ height: 168, justifyContent: 'space-between' }}
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
