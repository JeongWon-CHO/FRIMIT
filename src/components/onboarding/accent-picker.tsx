import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, opacity, type GroupAccentKey } from '@/constants/design-tokens';

/**
 * 그룹 강조색 셋.
 *
 * 커스텀 색도 컬러 피커도 없다. 강조색은 그룹이 나타나는 모든 화면에 실려 다니는
 * 정체성이라, 아무 색이나 고르게 하면 화면 전체의 빛 규칙이 무너진다.
 */
const KEYS: GroupAccentKey[] = ['violet', 'cyan', 'pink'];

export function AccentPicker({
  value,
  onChange,
}: {
  value: GroupAccentKey;
  onChange: (key: GroupAccentKey) => void;
}) {
  return (
    <View style={styles.row}>
      {KEYS.map((key) => {
        const accent = colors.groupAccent[key];
        const selected = key === value;

        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={key}
            onPress={() => onChange(key)}
            style={[
              styles.swatch,
              selected ? styles.selected : { opacity: opacity.unselectedSwatch },
              selected && Platform.OS === 'ios'
                ? { shadowColor: accent.dot, shadowOpacity: 0.6, shadowRadius: 11, shadowOffset: { width: 0, height: 0 } }
                : null,
            ]}>
            <LinearGradient
              colors={[accent.from, accent.to]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  swatch: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.accent.violetPale },
});
