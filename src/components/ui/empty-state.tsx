import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 비어 있음 — 그룹이 없거나, 활동이 없거나, 목표가 없을 때.
 *
 * 삽화를 넣지 않는다. 점선 원 하나가 오빗의 빈 좌석을 되울리고, 그게 이 제품에서
 * "아직 아무도 없다"의 유일한 시각 언어다.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.circle} />
      <AppText variant="bodyStrong" style={styles.center}>
        {title}
      </AppText>
      <AppText variant="metadata" tone="metadata" style={[styles.center, styles.body]}>
        {body}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border.dashed,
    backgroundColor: hexToRgba('#FFFFFF', 0.025),
    alignItems: 'center',
    gap: 10,
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border.dashed,
  },
  center: { textAlign: 'center' },
  body: { lineHeight: 19 },
});
