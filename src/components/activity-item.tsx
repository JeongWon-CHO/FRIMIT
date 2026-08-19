import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { colors, radius as radii } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';
import type { ActivityRow } from '@/lib/activity-view';

/**
 * 사건 한 줄.
 *
 * **피드 카드가 아니라 조용한 흐름이다**(COMPONENT_SPEC §11). 그림자도, 큰 여백도,
 * 카드 테두리도 없다. 목록이 스크롤될 때 눈이 걸리는 것은 아바타 하나와 문장뿐이어야
 * 한다.
 *
 * 사람이 없는 사건(한도 도달, 규칙 적용)에는 아바타 대신 38px 토큰 타일이 온다.
 * 자리를 비우면 문장이 들쭉날쭉해지고, 아무 아바타나 세우면 그 사람이 한 일처럼
 * 읽힌다.
 */
export const ActivityItem = memo(function ActivityItem({ row }: { row: ActivityRow }) {
  const accent = colors.groupAccent[row.accent];
  const violet = row.emphasis === 'violet';

  return (
    <View
      style={[
        styles.row,
        violet && {
          backgroundColor: hexToRgba(colors.accent.violet, 0.07),
          borderColor: hexToRgba(colors.accent.violetSoft, 0.14),
        },
      ]}>
      {row.actor ? (
        <Avatar
          id={row.actor.id}
          name={row.actor.name}
          emoji={row.actor.emoji}
          size="sm"
          borderColor={colors.background.base}
        />
      ) : (
        <View style={[styles.token, { borderColor: hexToRgba(accent.dot, 0.35) }]}>
          <View style={[styles.tokenDot, { backgroundColor: accent.dot }]} />
        </View>
      )}

      <View style={styles.text}>
        <AppText variant="body">{row.text}</AppText>
        <View style={styles.meta}>
          <AppText variant="metadata" tone="metadata">
            {row.groupName}
          </AppText>
          <AppText variant="metadata" tone="faint">
            {row.timeLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
});

/** 날짜 구분선. 항목이 아니라 목록의 일부다(COMPONENT_SPEC §11의 구현 노트). */
export function DayDivider({ label }: { label: string }) {
  return (
    <AppText variant="eyebrow" tone="faint" style={styles.divider}>
      {label}
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.activityItem,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: hexToRgba('#FFFFFF', 0.032),
  },
  token: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
  },
  tokenDot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { paddingTop: 14, paddingBottom: 2, paddingHorizontal: 6 },
});
