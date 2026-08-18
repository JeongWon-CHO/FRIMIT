import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Bloom, ProgressBar, Surface } from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';

/**
 * 공동 시간 정하기 — 09 화면의 주인공.
 *
 * 슬라이더나 다이얼로 바꾸지 않는다. 30분 단위의 정확도가 중요하고, 무엇보다
 * **큰 숫자 자체가 이 화면의 요점**이다. 슬라이더는 값을 흐리게 만든다.
 *
 * 기본값 8시간은 디자인의 결정이다. 서버 기본값은 2시간이지만 `create_group`이
 * 한도를 인자로 받으므로 마이그레이션 없이 여기서 정한다.
 */
export const SHARED_TIME_MIN = 120;
export const SHARED_TIME_MAX = 840;
export const SHARED_TIME_STEP = 30;
export const SHARED_TIME_DEFAULT = 480;

export function NumericTimeSelector({
  valueMinutes,
  memberCount = 4,
  onChange,
}: {
  valueMinutes: number;
  memberCount?: number;
  onChange: (minutes: number) => void;
}) {
  const atMin = valueMinutes <= SHARED_TIME_MIN;
  const atMax = valueMinutes >= SHARED_TIME_MAX;

  const step = (delta: number) =>
    onChange(
      Math.min(SHARED_TIME_MAX, Math.max(SHARED_TIME_MIN, valueMinutes + delta * SHARED_TIME_STEP))
    );

  return (
    <Surface
      fill={gradients.heroSurface.colors}
      gradientLocations={gradients.heroSurface.stops}
      cornerRadius={radii.heroCard}
      padding={20}
      texture="heroCard"
      border={colors.border.hairlineStrong}
      style={styles.card}
      bloom={<Bloom color={colors.accent.violet} size={300} opacity={0.5} x={170} y={0} />}>
      <AppText variant="eyebrow" tone="faint">
        SHARED DAILY TIME
      </AppText>

      {/*
        디자인은 ± 를 숫자 좌우에 두지만, 390pt 화면에서 그 배치는 `8h`까지만
        버틴다. 30분 단위 값(`8h 30m`)은 60px에서 210pt를 먹는데 두 원(46×2)과
        간격을 빼고 남는 자리는 100pt 남짓이다 — 실기기에서 숫자가 카드를 뚫고
        나왔다.

        슬라이더로 바꾸지 않고 ± 도 유지한다(스펙이 못 박은 부분이다). 대신
        숫자에 한 줄을 통째로 주고 버튼을 그 아래로 내렸다. 이 화면의 요점인
        "큰 숫자"가 그대로 남는 배치다.
      */}
      <View style={styles.value}>
        <AppText variant="heroNumber" style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
          {formatHours(valueMinutes)}
        </AppText>
        <AppText variant="metadata" tone="metadata">
          {memberCount}명 기준 · 1인 {formatHours(perPerson(valueMinutes, memberCount))}
        </AppText>
      </View>

      <View style={styles.row}>
        <RoundButton label="–" onPress={() => step(-1)} disabled={atMin} />
        <RoundButton label="+" onPress={() => step(1)} disabled={atMax} primary />
      </View>

      <View style={styles.range}>
        <ProgressBar
          progress={(valueMinutes - SHARED_TIME_MIN) / (SHARED_TIME_MAX - SHARED_TIME_MIN)}
          height={6}
          gradient={gradients.violetToBlue.colors}
        />
        <View style={styles.rangeLabels}>
          <AppText variant="numericLabel" tone="faint">
            2h
          </AppText>
          <AppText variant="numericLabel" tone="faint">
            30m 단위
          </AppText>
          <AppText variant="numericLabel" tone="faint">
            14h
          </AppText>
        </View>
      </View>
    </Surface>
  );
}

function RoundButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={primary ? '30분 늘리기' : '30분 줄이기'}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      // 길게 누르면 반복. 2h에서 14h까지 24번 누르게 두지 않는다.
      onLongPress={onPress}
      delayLongPress={150}
      style={[styles.circle, disabled && styles.circleDim]}>
      {primary && !disabled && (
        // 채움에도 같은 반경을 준다. `overflow: 'hidden'`만으로는 모서리가 남아
        // 원이 팔각형으로 보인다 — 아바타에서 겪은 것과 같은 함정이다.
        <LinearGradient
          colors={gradients.violetToBlue.colors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.18 }}
          style={[StyleSheet.absoluteFill, styles.circleFill]}
        />
      )}
      <AppText variant="cardTitle" tone="body" style={styles.glyph}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** 온전한 시간은 `8h`, 반 시간은 `8h 30m`. */
export function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours}h ${rest}m`;
  if (hours > 0) return `${hours}h`;
  return `${rest}m`;
}

/** 1인 몫은 5분 단위로 반올림한다. 소수점 분은 아무 의미가 없다. */
export function perPerson(minutes: number, memberCount: number): number {
  if (memberCount <= 0) return minutes;
  return Math.round(minutes / memberCount / 5) * 5;
}

const styles = StyleSheet.create({
  card: { gap: 18, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 26 },
  value: { alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  number: { fontSize: 60, lineHeight: 66, letterSpacing: -3, textAlign: 'center' },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  circleFill: { borderRadius: 23 },
  circleDim: { opacity: 0.35 },
  glyph: { fontSize: 22, lineHeight: 26 },
  range: { width: '100%', gap: 8 },
  rangeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
