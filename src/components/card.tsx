import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 배경에서 한 겹 떠 있는 면.
 *
 * 그림자를 쓰지 않는다. 다크 모드에서 그림자는 보이지 않고, 두 모드에 각각
 * 다른 그림자를 정하는 비용보다 얇은 테두리 하나가 정직하다.
 */
type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
};

export function Card({ children, onPress, style }: CardProps) {
  const theme = useTheme();
  const surface = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border },
    style,
  ];

  if (!onPress) return <View style={surface}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...surface, { opacity: pressed ? 0.8 : 1 }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
