import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { gradients } from '@/constants/design-tokens';

/**
 * 세 칸짜리 진행 표시 (03·04·05).
 *
 * 장식이다. 절대 누를 수 없다 — 권한 흐름의 중간을 건너뛰게 하면 안 되기 때문이다.
 * 06부터는 이걸 버리고 `STEP 3 OF 3` 같은 mono 라벨을 쓴다. 그 구분이 의도된 것이다.
 */
export function StepProgress({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, index) => {
        const done = index + 1 <= current;
        // 마지막 칸만 파랑→시안이다. 끝이 가까워졌다는 신호를 색으로 준다.
        const palette = index + 1 === total ? gradients.blueToCyan : gradients.violetToBlue;

        return done ? (
          <LinearGradient
            key={index}
            colors={palette.colors as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.dash}
          />
        ) : (
          <View key={index} style={[styles.dash, styles.upcoming]} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  dash: { width: 22, height: 4, borderRadius: 2 },
  upcoming: { backgroundColor: 'rgba(255,255,255,0.12)' },
});
