import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 04·11에서 되풀이되는 "이런 걸 보내요" 줄.
 *
 * 강조되는 줄은 화면당 하나뿐이다. 셋 다 빛나면 아무것도 강조되지 않는다.
 */
export function SampleRow({
  title,
  caption,
  emphasis,
}: {
  title: string;
  caption: string;
  emphasis?: boolean;
}) {
  return (
    <Surface
      fill={emphasis ? ['#14141F', '#0A0A10'] : colors.surface.row}
      border={emphasis ? hexToRgba(colors.accent.violetSoft, 0.18) : colors.border.subtle}
      cornerRadius={22}
      padding={14}
      style={styles.row}>
      {emphasis ? (
        <LinearGradient
          colors={gradients.violetToBlue.colors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.18 }}
          style={styles.tile}
        />
      ) : (
        <View style={[styles.tile, styles.tileQuiet]} />
      )}

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
  tileQuiet: { backgroundColor: hexToRgba('#FFFFFF', 0.08) },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 13 },
});
