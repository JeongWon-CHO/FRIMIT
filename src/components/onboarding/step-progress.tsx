import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { gradients } from '@/constants/design-tokens';

/**
 * 한 흐름이 얼마나 남았는지.
 *
 * 장식이다. 절대 누를 수 없다 — 권한 흐름의 중간을 건너뛰게 하면 안 되기 때문이다.
 *
 * **바가 가득 차는 순간이 그 흐름이 끝나는 순간이어야 한다.** 예전에는 03·04·05만
 * 세는 3칸이었고, 05에서 다 찬 뒤에도 권한·그룹·추적·대기실이 남아 있었다. 끝난
 * 줄 알았던 자리에서 다시 걷게 되는 것이 그것 때문이었다.
 *
 * 지금은 흐름마다 하나씩 있다:
 *   온보딩  03 닉네임 · 04 알림 · 05 프라이버시 · 06 권한   (4칸)
 *   그룹    09 이름·색 · 09 공동 시간 · 11~12 추적          (3칸)
 *
 * 두 흐름은 홈 화면으로 갈라져 있어서 이름표가 없어도 헷갈리지 않는다. 대기실에는
 * 붙이지 않는다 — 거기서 남은 일은 내 일이 아니라 친구가 들어오는 일이다.
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
