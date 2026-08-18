import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { DotTexture } from '@/components/ui/dot-texture';
import { colors, motion, radius as radii } from '@/constants/design-tokens';

/**
 * 카드 한 장.
 *
 * 깊이는 그림자가 아니라 **표면 대비 + 헤어라인 + 블룸 하나**에서 나온다
 * (COMPONENT_SPEC 공통 규칙). Android의 `elevation`은 검정 위에 회색 상자를
 * 그리므로 명시적으로 0으로 둔다.
 */
type SurfaceProps = {
  children: ReactNode;
  /** 단색이면 문자열, 그라데이션이면 색 배열 */
  fill?: string | readonly string[];
  gradientLocations?: readonly number[];
  /** 165° 같은 사선. `{x,y}` 시작·끝으로 옮겨 둔 값이다. */
  gradientAngle?: 'diagonal' | 'horizontal';
  border?: string;
  cornerRadius?: number;
  padding?: number;
  texture?: 'screen' | 'heroCard' | 'calm' | 'none';
  /** 블룸은 카드 밖으로 새면 안 되므로 여기서 클립된다. */
  bloom?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Surface({
  children,
  fill = colors.surface.card,
  gradientLocations,
  gradientAngle = 'diagonal',
  border = colors.border.hairline,
  cornerRadius = radii.groupCard,
  padding = 14,
  texture = 'none',
  bloom,
  onPress,
  style,
}: SurfaceProps) {
  const pressed = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - pressed.value * (1 - motion.press.scale) },
    ],
  }));

  const box: ViewStyle = {
    borderRadius: cornerRadius,
    borderWidth: 1,
    borderColor: border,
    padding,
    overflow: 'hidden',
    elevation: 0,
  };

  const body = (
    <>
      {Array.isArray(fill) ? (
        <LinearGradient
          colors={fill as [string, string, ...string[]]}
          locations={gradientLocations as [number, number, ...number[]] | undefined}
          start={{ x: gradientAngle === 'diagonal' ? 0.1 : 0, y: 0 }}
          end={gradientAngle === 'diagonal' ? { x: 0.9, y: 1 } : { x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill as string }]} />
      )}

      {bloom}
      {texture !== 'none' && <DotTexture tile={texture} />}

      {children}
    </>
  );

  if (!onPress) return <View style={[box, style]}>{body}</View>;

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(1, {
            duration: motion.duration.fast,
            easing: Easing.bezier(...(motion.easing.press as [number, number, number, number])),
          });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, {
            duration: motion.duration.fast,
            easing: Easing.bezier(...(motion.easing.press as [number, number, number, number])),
          });
        }}
        style={[box, style]}>
        {body}
      </Pressable>
    </Animated.View>
  );
}
