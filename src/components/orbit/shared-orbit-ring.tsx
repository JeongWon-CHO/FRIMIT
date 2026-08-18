import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';

import { borders, colors, motion } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';
import { useReduceMotion } from '@/lib/motion';
import { overshootDegrees, ringRadius, ringStroke, segmentsFor } from '@/lib/orbit';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Shared Orbit — 이 제품의 서명 그래픽.
 *
 * 링은 **그룹의 하루**지 내 하루가 아니다. 내 몫은 여러 구간 중 하나일 뿐이고,
 * 12시에서 시계 방향으로 차오른다.
 *
 * 아바타는 이 컴포넌트가 그리지 않는다 — SVG 안에 넣으면 터치 영역도 이미지
 * 로딩도 잃는다. 좌표만 `orbit.ts`가 주고, 배치는 부모가 `<View>`로 한다.
 *
 * 애니메이션은 `strokeDashoffset` 하나만 건드린다. `strokeDasharray`를
 * 애니메이션하거나 값이 바뀔 때 `<Svg>`를 다시 마운트하면 링이 깜빡인다.
 */
export type OrbitVariant = 'continuous' | 'segmented' | 'complete' | 'overshoot' | 'empty';

type SharedOrbitRingProps = {
  size: number;
  /** 0..1. 1을 넘겨도 링은 한 바퀴에서 멈춘다. */
  progress: number;
  variant?: OrbitVariant;
  gradient: readonly string[];
  /** 세그먼트 변형에서 멤버별 사용 초 (등수 순서 그대로) */
  segmentValues?: number[];
  segmentLimit?: number;
  /** 세그먼트 사이 틈에 비치는 색. 링이 올라앉은 표면 색을 준다. */
  gapColor?: string;
  /** 초과 변형에서 바깥 아크가 도는 정도 */
  overSeconds?: number;
  limitSeconds?: number;
  /** 바깥 점선 원 — "하루치 전부"의 그릇 */
  showTrackDashes?: boolean;
  glow?: 'none' | 'soft' | 'strong';
  /** 가운데 내용 (숫자). 터치를 먹지 않는다. */
  children?: ReactNode;
  /** 동기화가 늦은 멤버가 있을 때의 호박색 점선 원 */
  staleRing?: boolean;
  strokeRatio?: number;
};

export function SharedOrbitRing({
  size,
  progress,
  variant = 'continuous',
  gradient,
  segmentValues,
  segmentLimit,
  gapColor = colors.background.base,
  overSeconds = 0,
  limitSeconds = 0,
  showTrackDashes,
  glow = 'soft',
  children,
  staleRing,
  strokeRatio = borders.orbitStrokeRatio,
}: SharedOrbitRingProps) {
  const stroke = ringStroke(size, strokeRatio);
  const r = ringRadius(size, stroke);
  const circumference = 2 * Math.PI * r;

  // 발광 겹은 아크보다 두꺼워서 링 바깥으로 넘친다. 뷰포트를 그만큼 넓히지
  // 않으면 넘친 부분이 잘려서 링이 팔각형처럼 보인다.
  const pad = glow === 'none' || variant === 'empty' ? 2 : Math.ceil(stroke * 0.6);
  const box = size + pad * 2;
  const center = box / 2;

  const clamped = Math.max(0, Math.min(1, progress));
  const gradientId = `orbit-${Math.round(size)}-${gradient.join('')}`.replace(/[^a-zA-Z0-9-]/g, '');

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: withTiming(circumference * (1 - clamped), {
      duration: motion.duration.slow,
      easing: Easing.bezier(...(motion.easing.standard as [number, number, number, number])),
    }),
  }));

  const segments =
    variant === 'segmented' && segmentValues && segmentLimit
      ? segmentsFor(segmentValues, segmentLimit, circumference)
      : [];

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={box} height={box} style={{ position: 'absolute', left: -pad, top: -pad }}>
        <Defs>
          {/*
            conic 그라데이션이 없으므로 선형으로 근사한다. 축을 뒤집어 두는 이유는
            링 전체가 -90° 돌아 있기 때문이다 — 그대로 두면 아크가 시작하는 12시에
            마지막 색(시안)이 오고, 보라에서 시안으로 차오르는 순서가 뒤집힌다.
          */}
          <LinearGradient id={gradientId} x1="1" y1="1" x2="0" y2="0">
            {gradient.map((color, index) => (
              <Stop
                key={`${color}-${index}`}
                offset={index / Math.max(1, gradient.length - 1)}
                stopColor={color}
              />
            ))}
          </LinearGradient>
        </Defs>

        {/* 바깥 점선 — 아직 쓰지 않은 하루 전체를 담는 그릇 */}
        {showTrackDashes && (
          <Circle
            cx={center}
            cy={center}
            r={size / 2 - 1}
            stroke={colors.border.dashed}
            strokeWidth={1}
            strokeDasharray="3 6"
            fill="none"
          />
        )}

        <G rotation={-90} origin={`${center}, ${center}`}>
          {/* 남은 시간 */}
          <Circle
            cx={center}
            cy={center}
            r={r}
            stroke="rgba(255,255,255,0.055)"
            strokeWidth={stroke}
            fill="none"
          />

          {variant !== 'empty' && glow !== 'none' && (
            // 블러 대신 같은 아크를 넓고 흐리게 한 번 더 그린다. 링이 그려진
            // 것이 아니라 켜진 것처럼 보이게 하는 것이 이 겹의 전부다.
            <AnimatedCircle
              cx={center}
              cy={center}
              r={r}
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke * (glow === 'strong' ? 1.9 : 1.6)}
              strokeOpacity={glow === 'strong' ? 0.2 : 0.13}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              animatedProps={animatedProps}
            />
          )}

          {variant === 'segmented' ? (
            segments.map((segment, index) => (
              <Circle
                key={index}
                cx={center}
                cy={center}
                r={r}
                stroke={`url(#${gradientId})`}
                strokeWidth={stroke}
                strokeLinecap="butt"
                fill="none"
                strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                strokeDashoffset={-segment.offset}
              />
            ))
          ) : variant === 'complete' ? (
            // 한 바퀴를 다 돈 링. 밝은 끝점이 없어야 "끝났다"로 읽힌다.
            <Circle
              cx={center}
              cy={center}
              r={r}
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeOpacity={0.55}
              fill="none"
            />
          ) : variant === 'empty' ? null : (
            <AnimatedCircle
              cx={center}
              cy={center}
              r={r}
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              animatedProps={animatedProps}
            />
          )}

          {/* 세그먼트 사이의 틈. 색이 아니라 '없음'이라서 표면 색으로 덮는다. */}
          {variant === 'segmented' &&
            segments.map((segment, index) => (
              <Circle
                key={`gap-${index}`}
                cx={center}
                cy={center}
                r={r}
                stroke={gapColor}
                strokeWidth={stroke + 1}
                strokeLinecap="butt"
                fill="none"
                strokeDasharray={`${(2 / 360) * circumference} ${circumference}`}
                strokeDashoffset={-(segment.offset + segment.length)}
              />
            ))}
        </G>
      </Svg>

      {/* 초과분은 링 밖의 별도 아크가 진다. 두 바퀴 도는 링은 고장으로 읽힌다. */}
      {variant === 'overshoot' && overSeconds > 0 && (
        <OvershootArc size={size} degrees={overshootDegrees(overSeconds, limitSeconds)} />
      )}

      {staleRing && <StaleRing size={size} />}

      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

/**
 * 동기화가 늦은 사람이 있을 때의 호박색 점선.
 *
 * 12초에 한 바퀴 — **앱에서 유일한 연속 회전**이고, 이 속도라야 "로딩 중"이 아니라
 * "기다리는 중"으로 읽힌다. 동작 줄이기가 켜져 있으면 돌지 않고 그냥 서 있는다.
 */
function StaleRing({ size }: { size: number }) {
  const reduced = useReduceMotion();
  const spin = useSharedValue(0);
  const box = size + 12;

  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(360, { duration: 12000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
    // 공유값은 참조가 고정이라 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: (size - box) / 2, top: (size - box) / 2, width: box, height: box },
        style,
      ]}>
      <Svg width={box} height={box}>
        <Circle
          cx={box / 2}
          cy={box / 2}
          r={box / 2 - 1}
          stroke={hexToRgba(colors.state.staleSync, 0.4)}
          strokeWidth={1}
          strokeDasharray="4 5"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

function OvershootArc({ size, degrees }: { size: number; degrees: number }) {
  const outer = size * 1.11;
  const stroke = size * 0.045;
  const r = ringRadius(outer, stroke);
  const circumference = 2 * Math.PI * r;
  const swept = (degrees / 360) * circumference;

  return (
    <View
      pointerEvents="none"
      style={[styles.overshoot, { width: outer, height: outer, left: (size - outer) / 2, top: (size - outer) / 2 }]}>
      <Svg width={outer} height={outer}>
        <Defs>
          <LinearGradient id="overshoot" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#F472B6" />
            <Stop offset="1" stopColor={colors.state.overLimit} />
          </LinearGradient>
        </Defs>
        <G rotation={-90} origin={`${outer / 2}, ${outer / 2}`}>
          <Circle
            cx={outer / 2}
            cy={outer / 2}
            r={r}
            stroke="url(#overshoot)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${swept} ${circumference - swept}`}
          />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  overshoot: { position: 'absolute' },
});
