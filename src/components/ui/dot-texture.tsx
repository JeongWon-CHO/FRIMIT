import { Image, StyleSheet, View } from 'react-native';

/**
 * 도트 질감.
 *
 * 알파를 PNG에 구워 뒀으므로 여기서 opacity를 만지지 않는다. `<View>` 수백 개로
 * 격자를 그리거나 SVG `<Pattern>`을 화면 전체에 까는 것은 금지다 —
 * `resizeMode="repeat"` 한 장이 가장 싸다.
 *
 * 이차 표면(목록 행, 작은 카드)에는 질감을 넣지 않는다.
 */
const TILES = {
  /** 화면 배경 (17px, 7.5%) */
  screen: require('@/assets/images/dot-17.png'),
  /** 히어로 카드 (13px, 5%) */
  heroCard: require('@/assets/images/dot-13.png'),
  /** 한도 도달 · 권한 꺼짐의 차분한 질감 (22px, 4.5%) */
  calm: require('@/assets/images/dot-22.png'),
} as const;

export function DotTexture({ tile = 'screen' }: { tile?: keyof typeof TILES }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={TILES[tile]} resizeMode="repeat" style={StyleSheet.absoluteFill} />
    </View>
  );
}
