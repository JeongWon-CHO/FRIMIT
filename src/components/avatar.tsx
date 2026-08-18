import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AVATAR_PRESETS, avatarEmoji } from '@/lib/profile';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 프리셋 아바타.
 *
 * 이미지 대신 이모지를 쓴다. 사용자 업로드는 MVP 범위 밖이고(신고·검수 부담),
 * 프리셋을 이미지로 만들면 8개 × 2배율 에셋이 늘어난다. 이모지는 플랫폼마다
 * 모양이 다르지만, 같은 사람이 같은 자리에 있다는 것만 알면 되는 용도다.
 */
export function Avatar({ avatarKey, size = 40 }: { avatarKey: string; size?: number }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.backgroundElement,
        },
      ]}>
      <Text style={{ fontSize: size * 0.5 }}>{avatarEmoji(avatarKey)}</Text>
    </View>
  );
}

/** 온보딩의 아바타 고르기. 선택은 테두리 색이 아니라 채운 배경으로 표시한다. */
export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (avatarKey: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.grid}>
      {AVATAR_PRESETS.map((preset) => {
        const selected = preset.key === value;

        return (
          <Pressable
            key={preset.key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`아바타 ${preset.emoji}`}
            onPress={() => onChange(preset.key)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? theme.accentQuiet : theme.backgroundElement,
                borderColor: selected ? theme.accent : 'transparent',
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            <Text style={styles.optionEmoji}>{preset.emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    width: 64,
    height: 64,
    borderRadius: Radius.control,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionEmoji: {
    fontSize: 30,
  },
});
