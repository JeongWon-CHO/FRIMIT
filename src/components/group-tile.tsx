import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, AvatarStack, Bloom, StatusDot, Surface } from '@/components/ui';
import { colors, layout, radius as radii } from '@/constants/design-tokens';
import type { PoolView } from '@/lib/today';

/**
 * 오늘 그리드의 그룹 카드 한 장 — 저마다 작게 빛나는 물체 하나.
 *
 * 블룸의 위치가 강조색마다 다르다(보라 좌상, 시안 우하, 분홍 상단 중앙). 같은
 * 자리에 두면 그리드가 도장을 찍은 것처럼 보인다.
 *
 * SVG를 쓰지 않는다. 목록 안에 오빗을 마운트하면 그룹이 늘어날수록 스크롤이
 * 무너진다(RN_IMPLEMENTATION_NOTES의 성능 항목).
 */
type GroupTileProps = {
  view: PoolView;
  /** 세 번째 카드는 두 칸을 차지한다. */
  wide?: boolean;
  onPress: () => void;
};

const BLOOM_POSITION = {
  violet: { x: 30, y: 20 },
  cyan: { x: 150, y: 110 },
  pink: { x: 90, y: 0 },
} as const;

export const GroupTile = memo(function GroupTile({ view, wide, onPress }: GroupTileProps) {
  const accent = colors.groupAccent[view.accent];
  const position = BLOOM_POSITION[view.accent];
  const over = view.overSeconds > 0;

  return (
    <Surface
      fill={accent.surface}
      cornerRadius={radii.groupCard}
      padding={14}
      onPress={onPress}
      style={{
        height: wide ? layout.groupCardWideHeight : layout.groupCardHeight,
        ...(wide
          ? {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
            }
          : { justifyContent: 'space-between' }),
      }}
      bloom={<Bloom color={accent.bloom} size={220} opacity={0.45} {...position} />}>
      {!wide && (
        <AvatarStack
          members={view.seats.map((seat) => ({ id: seat.id, name: seat.name, emoji: seat.emoji }))}
          surfaceColor={accent.surface}
        />
      )}

      <View style={styles.text}>
        <AppText variant="cardNumber" tone={over ? 'over' : 'primary'}>
          {view.headline}
        </AppText>
        <AppText variant="metadata" tone="muted">
          {view.groupName}
        </AppText>
      </View>

      {wide && (
        <AvatarStack
          members={view.seats.map((seat) => ({ id: seat.id, name: seat.name, emoji: seat.emoji }))}
          surfaceColor={accent.surface}
        />
      )}
    </Surface>
  );
});

/**
 * 아직 시작하지 않은 그룹.
 *
 * 상태는 알약이 아니라 **점 하나와 작은 글자**로 오른쪽 위에 앉는다. 알약은
 * 채운 배경과 테두리를 함께 갖고 있어서, 카드가 하나뿐인 그리드에서는 그것이
 * 카드 안의 두 번째 카드처럼 보인다. 여기서 말해야 하는 것은 "아직 안 시작했다"는
 * 사실 한 줄이고, 그 무게는 점 하나면 충분하다.
 *
 * 넓은 카드에서는 이름과 상태를 좌우로 갈라 놓는다. 88px 안에 셋을 세로로
 * 쌓으면 서로 붙어서 한 덩어리로 보인다.
 *
 * 좁은 카드는 `space-between`을 쓰지 않는다. 그러면 124px 안에서 상태는 맨 위,
 * 이름은 맨 아래로 갈라져 사이가 휑해진다. 대신 위에서부터 쌓는다 — 아래가 비는
 * 대신 둘이 한 덩어리로 읽힌다.
 *
 * ⚠️ 그 대가로 활성 그룹 카드(`GroupTile`)와 이름 높이가 어긋난다. 그쪽은 여전히
 * 아래에서부터 쌓는다. 섞인 그리드에서 그게 거슬리면 여기를 되돌리면 된다.
 */
export function DraftTile({
  name,
  wide,
  onPress,
}: {
  name: string;
  wide?: boolean;
  onPress: () => void;
}) {
  const text = (
    <View style={styles.draftText}>
      <AppText variant="cardTitle">{name}</AppText>
      <AppText variant="metadata" tone="muted">
        친구를 기다리는 중
      </AppText>
    </View>
  );

  return (
    <Surface
      fill={colors.surface.cardNeutral}
      cornerRadius={radii.groupCard}
      padding={wide ? 18 : 16}
      onPress={onPress}
      style={
        wide
          ? {
              height: layout.groupCardWideHeight,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }
          : { height: layout.groupCardHeight, gap: 10 }
      }>
      {wide ? (
        <>
          {text}
          <DraftStatus />
        </>
      ) : (
        <>
          <View style={styles.draftStatusRow}>
            <DraftStatus />
          </View>
          {text}
        </>
      )}
    </Surface>
  );
}

/** 점과 글자 한 쌍. 색은 호박색 — 멈춘 것이 아니라 기다리는 중이라는 뜻이다. */
function DraftStatus() {
  return (
    <View style={styles.draftStatus}>
      <StatusDot color={colors.state.staleSync} size={6} />
      <AppText variant="metadata" tone="metadata">
        시작 대기
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { gap: 3 },
  draftText: { gap: 5, flexShrink: 1 },
  draftStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // 좁은 카드에서는 오른쪽 위 구석에 붙는다.
  draftStatusRow: { flexDirection: 'row', justifyContent: 'flex-end' },
});
