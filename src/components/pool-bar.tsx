import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 공동 풀 바.
 *
 * 이 제품의 화면 하나만 남긴다면 이것이다. 멤버별 사용시간이 **하나의 바에 이어서**
 * 쌓이고, 남은 자리가 곧 그룹의 잔여시간이다. 사람마다 막대를 따로 그리면 그건
 * 순위표가 되는데, 그건 이 제품이 하지 않기로 한 것이다(plan.md 10행: 순위·꼴찌
 * 표시·공개 비난 배제). 같은 데이터를 한 줄에 이어 붙이는 것만으로 "우리가 같은
 * 풀을 쓴다"가 구조로 드러난다.
 *
 * 구간의 색에는 서열이 없다. 사람마다 고정된 색이고(`memberHue`) 정렬 순서도
 * 서버가 준 순서를 그대로 쓰지 않는다 — 큰 것부터 늘어놓으면 색만 없는 순위표다.
 *
 * 한도를 넘기면 분모가 한도에서 총합으로 바뀌고, 한도 지점에 눈금이 선다.
 * 넘긴 구간은 장미색 막이 덮이지만 멤버 색은 그대로 보인다 — 누가 넘겼는지
 * 지목하지 않는 것과, 얼마나 넘겼는지 숨기는 것은 다른 얘기다.
 */

export type PoolSegment = {
  id: string;
  seconds: number;
  /** 이 구간의 색. 나는 강조색, 남은 각자의 고정 색. */
  color: string;
};

type PoolBarProps = {
  segments: PoolSegment[];
  limitSeconds: number;
  /** 넘긴 초. 0보다 크면 한도 눈금과 초과 막이 함께 나타난다. */
  overSeconds: number;
  /** 카드 안(14)과 상세용(20)에서 다르게 쓴다. */
  height?: number;
};

export function PoolBar({ segments, limitSeconds, overSeconds, height = 14 }: PoolBarProps) {
  const theme = useTheme();

  const used = segments.reduce((sum, segment) => sum + Math.max(0, segment.seconds), 0);
  // 넘겼으면 총합이 바 전체가 된다. 한도는 그 안의 한 지점으로 물러난다.
  const denominator = Math.max(limitSeconds, used, 1);
  const limitRatio = limitSeconds / denominator;

  return (
    <View style={[styles.track, { height, borderRadius: Radius.bar, backgroundColor: theme.poolTrack }]}>
      {segments
        .filter((segment) => segment.seconds > 0)
        .map((segment) => (
          <View
            key={segment.id}
            style={[
              // 1초를 쓴 사람도 보여야 한다. 폭이 0.1%면 아무것도 안 그려지고,
              // 화면에서는 "동기화가 안 됐다"와 구분되지 않는다.
              styles.segment,
              { width: `${(segment.seconds / denominator) * 100}%`, backgroundColor: segment.color },
            ]}
          />
        ))}

      {overSeconds > 0 && (
        <>
          <View
            style={[
              styles.overWash,
              { left: `${limitRatio * 100}%`, backgroundColor: theme.over + '59' },
            ]}
          />
          <View style={[styles.limitTick, { left: `${limitRatio * 100}%`, backgroundColor: theme.over }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  segment: {
    minWidth: 3,
    height: '100%',
  },
  overWash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
  limitTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
});
