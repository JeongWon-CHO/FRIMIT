import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { DotTexture } from '@/components/ui/dot-texture';
import { colors, motion, radius as radii } from '@/constants/design-tokens';
import { EASE } from '@/lib/motion';

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
    transform: [{ scale: 1 - pressed.value * (1 - motion.press.scale) }],
  }));

  // 깊이를 elevation으로 만들지 않는다 — 검정 위에서는 회색 상자가 된다.
  // 흰색을 4%만 덮는 것이 "가라앉았다"의 전부다.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: pressed.value * motion.press.overlayOpacity,
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
          pressed.value = withTiming(1, { duration: motion.duration.fast, easing: EASE.press });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 160, easing: EASE.press });
        }}
        style={[box, style]}>
        {body}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.press, overlayStyle]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  press: { backgroundColor: '#FFFFFF' },
});
