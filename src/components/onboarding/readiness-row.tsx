import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Surface } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 한 사람의 준비 상태 (13).
 *
 * 칩(`✓ Screen Time`, `✓ 6 apps`)은 **자기 줄에만** 붙는다. 남의 권한 상태와 고른
 * 앱 개수를 늘어놓는 화면이 되면 안 되고, 애초에 앱 개수는 서버로 올라가지도 않는다.
 *
 * 아직 준비되지 않은 사람은 점선이다. 그건 초대이지 망신이 아니다.
 */
type Props = {
  name: string;
  id: string;
  emoji?: string;
  state: 'ready' | 'self-ready' | 'pending';
  chips?: string[];
  pendingReason?: string;
  onNudge?: () => void;
  nudgeDisabled?: boolean;
};

export function ReadinessRow({
  name,
  id,
  emoji,
  state,
  chips,
  pendingReason,
  onNudge,
  nudgeDisabled,
}: Props) {
  const self = state === 'self-ready';
  const pending = state === 'pending';

  return (
    <Surface
      fill={
        self ? ['#151029', '#0B0B12'] : pending ? hexToRgba('#FFFFFF', 0.02) : colors.surface.row
      }
      border={self ? colors.border.violet : pending ? colors.border.dashed : colors.border.subtle}
      cornerRadius={24}
      padding={16}
      style={[styles.row, pending && styles.dashed]}>
      <Avatar
        id={id}
        name={name}
        emoji={pending ? undefined : emoji}
        size={44}
        ring={self ? 'activity' : pending ? 'pending' : 'none'}
        borderColor={self ? '#12101F' : '#0B0B10'}
      />

      <View style={styles.text}>
        <AppText variant="bodyStrong" tone={pending ? 'muted' : 'primary'} style={styles.name}>
          {name}
        </AppText>

        {chips && chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <View key={chip} style={styles.chip}>
                <AppText variant="metadata" tone="cyan">
                  {chip}
                </AppText>
              </View>
            ))}
          </View>
        )}

        {pending && pendingReason && (
          <AppText variant="metadata" tone="stale">
            {pendingReason}
          </AppText>
        )}
      </View>

      {pending && onNudge ? (
        <Pressable
          accessibilityRole="button"
          disabled={nudgeDisabled}
          onPress={onNudge}
          style={[styles.nudge, nudgeDisabled && styles.nudgeOff]}>
          <AppText variant="metadata" tone="stale">
            Nudge
          </AppText>
        </Pressable>
      ) : (
        !pending && (
          <AppText variant="bodyStrong" tone="cyan">
            Ready
          </AppText>
        )
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  dashed: { borderStyle: 'dashed' },
  text: { flex: 1, gap: 5 },
  name: { fontSize: 15 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: hexToRgba(colors.accent.cyan, 0.1),
    borderWidth: 1,
    borderColor: hexToRgba(colors.accent.cyan, 0.22),
  },
  nudge: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: hexToRgba(colors.state.staleSync, 0.1),
    borderWidth: 1,
    borderColor: hexToRgba(colors.state.staleSync, 0.24),
  },
  nudgeOff: { opacity: 0.4 },
});
