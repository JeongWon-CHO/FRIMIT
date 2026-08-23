import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';

/**
 * "이런 걸 보내요" 줄 (04).
 *
 * 셋 다 **같은 등급**이다. 예전에는 첫 줄만 밝은 표면에 그라데이션 타일이었는데,
 * 그건 강조가 아니라 선택으로 읽혔다 — 무언가 켜져 있거나 눌러야 하는 줄처럼
 * 보인다. 여기 셋은 알림의 예시일 뿐 고를 것이 아니다.
 *
 * 타일도 셋 다 같다. 실제 알림 센터에서 세 알림에 붙는 아이콘은 어차피 같은
 * 앱 아이콘 하나다. 비워 두면 이미지가 깨진 자리처럼 보인다.
 */
export function SampleRow({ title, caption }: { title: string; caption: string }) {
  return (
    <Surface
      fill={colors.surface.row}
      border={colors.border.subtle}
      cornerRadius={22}
      padding={14}
      style={styles.row}>
      <LinearGradient
        colors={gradients.violetToBlue.colors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.18 }}
        style={styles.tile}
      />

      <View style={styles.text}>
        <AppText variant="bodyStrong" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="metadata" tone="metadata">
          {caption}
        </AppText>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 34, height: 34, borderRadius: 11 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 13 },
});
