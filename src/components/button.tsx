import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 버튼 셋.
 *
 * - `primary`  화면의 목적. 한 화면에 하나만 둔다.
 * - `quiet`    같은 화면의 대안 경로 (그룹 만들기 옆의 초대 코드로 참여하기)
 * - `plain`    "나중에 하기"처럼 흐름에서 빠지는 길. 테두리도 배경도 없다.
 *
 * 라벨은 눌렀을 때 일어나는 일을 그대로 적는다. "확인"이 아니라 "그룹 만들기"다.
 */
type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet' | 'plain';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const blocked = disabled || loading;

  const surface: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: theme.accent }
      : variant === 'quiet'
        ? { backgroundColor: theme.backgroundElement }
        : { backgroundColor: 'transparent' };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(blocked), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        variant === 'plain' && styles.plain,
        surface,
        // 눌린 상태를 색이 아니라 투명도로 표현한다. 색을 바꾸면 변형마다
        // 눌린 색을 따로 정해야 하고, 다크 모드에서 한 번 더 정해야 한다.
        { opacity: blocked ? 0.45 : pressed ? 0.72 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.onAccent : theme.text} />
      ) : (
        <ThemedText
          type="smallBold"
          themeColor={variant === 'primary' ? 'onAccent' : variant === 'plain' ? 'textSecondary' : 'text'}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {
    minHeight: 44,
    paddingVertical: Spacing.two,
  },
});
