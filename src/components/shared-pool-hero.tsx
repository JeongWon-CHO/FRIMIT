import { StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { AppText, Avatar, Bloom, StatusPill, Surface } from '@/components/ui';
import { colors, gradients, layout, radius as radii } from '@/constants/design-tokens';
import { POOL_VISUALS } from '@/lib/pool-state';
import { hexToRgba } from '@/lib/color';
import type { PoolView } from '@/lib/today';

/**
 * 오늘 화면의 히어로 — 이 앱에서 가장 중요한 요소 하나.
 *
 * **여덟 상태가 같은 레이아웃을 쓴다.** 바뀌는 것은 빛뿐이다 — 블룸의 색과 위치,
 * 아크의 그라데이션, 알약의 톤, 숫자, 질감의 밀도. 컴포넌트를 새로 만들거나
 * 스택을 재배치하지 않는다. 예외는 스펙이 명시한 둘뿐이다: 동기화 이슈는 게이지
 * 아래 한 줄을 더하고, 권한 꺼짐은 푸터를 CTA로 바꾼다.
 */
type SharedPoolHeroProps = {
  view: PoolView;
  onPress?: () => void;
  /** 권한 꺼짐 상태에서 푸터를 대신하는 블록 */
  permissionCta?: React.ReactNode;
  /** 동기화가 늦은 멤버가 있을 때 게이지 아래 한 줄 */
  syncRow?: React.ReactNode;
};

export function SharedPoolHero({ view, onPress, permissionCta, syncRow }: SharedPoolHeroProps) {
  const visual = POOL_VISUALS[view.state];
  const off = view.state === 'permissionOff';
  const accent = colors.groupAccent[view.accent];

  // 동기화 줄이 들어오면 게이지 상자만 줄어든다. 나머지는 움직이지 않는다.
  const gaugeBoxHeight = syncRow ? 166 : layout.heroGaugeBoxHeight;

  return (
    <Surface
      fill={gradients.heroSurfaceToday.colors}
      gradientLocations={gradients.heroSurfaceToday.stops}
      cornerRadius={radii.heroCard}
      padding={0}
      texture={visual.texture === 'calm' ? 'calm' : 'heroCard'}
      border={off ? colors.border.hairline : colors.border.hairlineStrong}
      onPress={onPress}
      bloom={
        visual.heroBloom.size > 0 ? (
          <Bloom
            color={visual.heroBloom.color}
            size={visual.heroBloom.size}
            opacity={visual.heroBloom.opacity}
            x={175}
            y={visual.heroBloom.y}
          />
        ) : undefined
      }>
      <View style={styles.body}>
        <View style={styles.pillRow}>
          <StatusPill label={view.groupName} dotColor={off ? colors.text.disabled : accent.dot} />
          <AppText variant="numericLabel" style={{ color: visual.chip }}>
            {view.percentLabel}
          </AppText>
        </View>

        <View style={[styles.gaugeBox, { height: gaugeBoxHeight }]}>
          <View>
            <SharedOrbitRing
              size={layout.heroGaugeSize}
              progress={view.progress}
              variant={
                off
                  ? 'empty'
                  : view.state === 'over'
                    ? 'overshoot'
                    : view.state === 'complete'
                      ? 'complete'
                      : 'continuous'
              }
              gradient={visual.arc}
              overSeconds={view.overSeconds}
              limitSeconds={view.limitSeconds}
              glow={off ? 'none' : 'soft'}
              staleRing={view.stale}>
              <AppText variant="heroNumberSm" tone={visual.numberTone}>
                {off ? '— —' : view.headline}
              </AppText>
              <AppText variant="metadata" tone={view.stale ? 'stale' : 'metadata'}>
                {off ? 'Screen Time 권한 필요' : view.stale ? 'may be less' : view.sublabel}
              </AppText>
            </SharedOrbitRing>

            {/* 권한이 없으면 아바타도 걸지 않는다. 우리 숫자가 아니기 때문이다. */}
            {!off && (
              <OrbitSeats
                seats={view.seats}
                size={layout.heroGaugeSize}
                surfaceColor="#0F0F16"
              />
            )}
          </View>
        </View>

        {syncRow}

        {permissionCta ?? (
          <View style={styles.footer}>
            <AppText variant="metadata" tone="metadata">
              {view.syncLabel}
            </AppText>

            {view.highlight && (
              <View style={styles.highlight}>
                <Avatar
                  id={view.highlight.name}
                  name={view.highlight.name}
                  size={18}
                  borderColor="#0F0F16"
                />
                <AppText variant="metadata" tone="muted">
                  {view.highlight.name} · {view.highlight.label}
                </AppText>
              </View>
            )}
          </View>
        )}
      </View>
    </Surface>
  );
}

/**
 * 동기화가 늦은 사람 한 줄.
 *
 * 호박색이지만 블룸은 없다 — 이 줄은 상태를 바꾸는 것이 아니라 사실 하나를
 * 덧붙일 뿐이라서, 화면의 빛을 건드리면 안 된다.
 */
export function SyncRow({
  member,
  action,
}: {
  member: { id: string; name: string; emoji: string; syncLabel: string };
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.syncRow}>
      <Avatar id={member.id} name={member.name} emoji={member.emoji} size={26} borderColor="#171410" />
      <AppText variant="metadata" tone="stale" style={styles.syncText}>
        {member.name} · {member.syncLabel}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 30,
  },
  gaugeBox: { alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    backgroundColor: hexToRgba(colors.state.staleSync, 0.08),
    borderWidth: 1,
    borderColor: hexToRgba(colors.state.staleSync, 0.2),
  },
  syncText: { flex: 1 },
});
