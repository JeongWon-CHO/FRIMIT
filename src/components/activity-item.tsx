import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { REACTION_EMOJI } from '@/lib/activity-kinds';
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
export const ActivityItem = memo(function ActivityItem({
  row,
  onReact,
}: {
  row: ActivityRow;
  onReact: (emoji: string) => void;
}) {
  const accent = colors.groupAccent[row.accent];
  const violet = row.emphasis === 'violet';
  const [picking, setPicking] = useState(false);
  const mine = row.reactions.find((chip) => chip.mine);

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

        <View style={styles.chips}>
          {row.reactions.map((chip) => (
            <Pressable
              key={chip.emoji}
              accessibilityRole="button"
              onPress={() => onReact(chip.emoji)}
              style={[styles.chip, chip.mine && styles.chipMine]}>
              <AppText variant="metadata">
                {chip.emoji} {chip.count}
              </AppText>
            </Pressable>
          ))}

          {/*
            고르는 자리. 다섯 개를 늘 펼쳐 두면 조용한 흐름이 이모지 밭이 된다.
            눌러야 나오고, 하나 고르면 다시 접힌다.

            반응은 사람당 하나다(0011). 이미 달아 둔 사람에게 `+`를 보여주면 하나
            더 붙일 수 있다고 말하는 셈인데 실제로는 바뀐다. 글자를 바꿔 둔다 —
            기호로 때우면 그 차이를 아무도 못 읽는다.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mine ? '반응 바꾸기' : '반응 달기'}
            onPress={() => setPicking((open) => !open)}
            style={styles.chip}>
            <AppText variant="metadata" tone="faint">
              {picking ? '×' : mine ? '바꾸기' : '+'}
            </AppText>
          </Pressable>

          {picking &&
            REACTION_EMOJI.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                onPress={() => {
                  setPicking(false);
                  onReact(emoji);
                }}
                style={styles.chip}>
                <AppText variant="metadata">{emoji}</AppText>
              </Pressable>
            ))}
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
    alignItems: 'flex-start',
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    borderWidth: 1,
    borderColor: 'transparent',
    flexShrink: 0,
  },
  chipMine: {
    backgroundColor: hexToRgba(colors.accent.violet, 0.16),
    borderColor: hexToRgba(colors.accent.violetSoft, 0.3),
  },
  divider: { paddingTop: 14, paddingBottom: 2, paddingHorizontal: 6 },
});
