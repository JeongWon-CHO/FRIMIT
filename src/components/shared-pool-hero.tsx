import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { AppText, Avatar, Bloom, StatusPill, Surface } from '@/components/ui';
import { colors, gradients, layout, motion, radius as radii } from '@/constants/design-tokens';
import { useCountingValue, useReduceMotion } from '@/lib/motion';
import { formatPoolHeadline, formatUsedPercent } from '@/lib/format';
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
  const reduced = useReduceMotion();

  /**
   * 숫자를 세어 올린다. 아크와 같은 420ms 위에서 움직여야 둘이 한 동작으로 읽힌다.
   * 초과 상태에서는 초과분을, 그 외에는 잔여를 센다 — 화면이 부르는 값이 그것이다.
   */
  const counted = useCountingValue(view.overSeconds > 0 ? view.overSeconds : view.limitSeconds - view.usedSeconds, reduced);
  const countedUsed = useCountingValue(view.usedSeconds, reduced);

  const headline = off
    ? '— —'
    : formatPoolHeadline(
        view.overSeconds > 0 ? 0 : Math.max(0, counted),
        view.overSeconds > 0 ? Math.max(0, counted) : 0
      );

  const percentLabel = off
    ? '기록 없음'
    : formatUsedPercent(Math.max(0, countedUsed), view.limitSeconds, view.stale);

  /**
   * 블룸 호흡. **화면에 하나뿐이어야 하고 blur에서 멈춰야 한다** — 세 화면이
   * 뒤에서 함께 뛰면 그 자체로 프레임을 먹는다.
   */
  const pulse = useSharedValue(1);

  useFocusEffect(
    useCallback(() => {
      if (reduced || off) return;

      const period =
        view.state === 'approaching'
          ? motion.loop.approachingPulseMs
          : view.state === 'complete'
            ? motion.loop.calmPulseMs
            : motion.loop.heroPulseMs;

      pulse.value = withRepeat(
        withTiming(1.06, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );

      return () => cancelAnimation(pulse);
      // 공유값은 참조가 고정이라 의존성에 넣지 않는다 — 넣으면 훅에 넘긴 값을
      // 다시 바꾼다는 경고가 뜬다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reduced, off, view.state])
  );

  const bloomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.85 + (pulse.value - 1) * 2.5,
  }));

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
          <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]} pointerEvents="none">
            <Bloom
              color={visual.heroBloom.color}
              size={visual.heroBloom.size}
              opacity={visual.heroBloom.opacity}
              x={175}
              y={visual.heroBloom.y}
            />
          </Animated.View>
        ) : undefined
      }>
      <View style={styles.body}>
        <View style={styles.pillRow}>
          <StatusPill label={view.groupName} dotColor={off ? colors.text.disabled : accent.dot} />
          <AppText variant="numericLabel" style={{ color: visual.chip }}>
            {percentLabel}
          </AppText>
        </View>

        <View style={[styles.gaugeBox, { height: gaugeBoxHeight }]}>
          <View>
            <SharedOrbitRing
              size={layout.heroGaugeSize}
              /*
                새 하루에는 아직 쓴 시간이 없지만 링을 완전히 비워 두면 "아직
                시작 안 됨"이나 "고장"으로 읽힌다. 상태 스펙 A는 12시에 5~8°
                틱을 남기라고 하는데, 그 자리에는 내 아바타가 앉아 있어서
                (32px / 반지름 73.7 ≈ ±12°) 그 길이로는 통째로 가려진다.
                아바타 뒤에서 겨우 빠져나오는 18°가 실기기에서 보이는 최소값이다.
              */
              progress={view.state === 'fresh' ? Math.max(view.progress, 18 / 360) : view.progress}
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
              {/*
                링 안쪽 폭에 묶어 둔다. `42m over`처럼 긴 값은 36px에서 지름을 넘어
                아바타 아래로 삐져나간다 — 그때는 글자가 줄어드는 편이 맞다.
                숫자가 잘리면 이 화면이 존재하는 이유가 사라진다.
              */}
              <View style={styles.center}>
                <AppText
                  variant="heroNumberSm"
                  tone={visual.numberTone}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}>
                  {headline}
                </AppText>
                <AppText
                  variant="metadata"
                  tone={view.stale ? 'stale' : 'metadata'}
                  numberOfLines={2}
                  style={styles.sublabel}>
                  {off ? 'Screen Time 권한 필요' : view.stale ? '더 적을 수 있어요' : view.sublabel}
                </AppText>
              </View>
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
  // 162 링에서 안쪽 지름은 약 133이다. 아바타와 부딪히지 않게 그보다 좁게 잡는다.
  center: { width: 124, alignItems: 'center' },
  sublabel: { textAlign: 'center' },
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
