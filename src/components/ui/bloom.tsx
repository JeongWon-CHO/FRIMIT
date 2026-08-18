import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { hexToRgba } from '@/lib/color';

/**
 * 블룸 — 빛 한 덩어리.
 *
 * 디자인의 목업은 CSS `filter: blur()`를 쓰지만 RN에서 그건 매 프레임 비싸고
 * Android에서는 색 있는 그림자가 아예 무시된다. 대신 `RadialGradient` 한 장을
 * 절대 배치로 깐다 — 블러 없이 같은 인상을 만들고, 스크롤 중에도 공짜다.
 *
 * **화면당 두 겹까지.** 목록 행 안에는 절대 넣지 않는다(RN_IMPLEMENTATION_NOTES).
 */
type BloomProps = {
  /** `#RRGGBB` 또는 `rgba(...)` */
  color: string;
  /** 지름. 카드보다 1.4~1.8배 크게 잡는 것이 스펙이다. */
  size: number;
  opacity?: number;
  /** 중심 위치. 카드 좌상단 기준 좌표이며 음수로 카드 밖에 둘 수 있다. */
  x: number;
  y: number;
};

export function Bloom({ color, size, opacity = 1, x, y }: BloomProps) {
  const id = `bloom-${color}-${size}`.replace(/[^a-zA-Z0-9-]/g, '');

  return (
    <View
      pointerEvents="none"
      style={[styles.root, { left: x - size / 2, top: y - size / 2, width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={hexToRgba(color, opacity)} />
            {/* 0.7에서 이미 거의 사라진다. 가장자리가 원으로 보이면 안 된다. */}
            <Stop offset="0.7" stopColor={hexToRgba(color, opacity * 0.12)} />
            <Stop offset="1" stopColor={hexToRgba(color, 0)} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute' },
});
