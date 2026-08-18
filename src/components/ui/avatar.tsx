import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, gradients, layout } from '@/constants/design-tokens';
import { memberFill } from '@/constants/theme';
import { hexToRgba } from '@/lib/color';

/**
 * 사람 한 명의 존재.
 *
 * 색은 profile_id 해시로 정한다 — 목록 순서가 바뀌어도 같은 사람은 같은 색이다.
 * 디자인의 `avatarFills`는 인덱스 기반이지만, 인덱스는 정렬이 바뀔 때마다 사람
 * 색을 바꾼다. 이 앱에서 색은 사람의 이름표라 그러면 안 된다.
 *
 * 테두리는 **자기가 올라앉은 표면의 색**이다. 그래야 아바타가 아크나 다른
 * 아바타에서 깔끔하게 오려진 것처럼 보인다.
 */
export type AvatarSize = keyof typeof layout.avatar;

type AvatarProps = {
  /** 색을 정하는 씨앗. profile_id를 그대로 넘긴다. */
  id: string;
  /** 이니셜에 쓸 이름. 이모지 아바타 키가 있으면 그것이 우선한다. */
  name?: string;
  /** 프리셋 이모지 아바타 (`avatar-01` …). 서버 프로필의 값. */
  emoji?: string;
  size?: AvatarSize | number;
  ring?: 'none' | 'activity' | 'achievement' | 'pending';
  /** 올라앉은 표면 색 */
  borderColor?: string;
  dimmed?: boolean;
  style?: ViewStyle;
};

export function Avatar({
  id,
  name,
  emoji,
  size = 'md',
  ring = 'none',
  borderColor = colors.background.base,
  dimmed,
  style,
}: AvatarProps) {
  const diameter = typeof size === 'number' ? size : layout.avatar[size];
  const [from, to] = memberFill(id);

  const body = (
    <View
      style={[
        styles.disc,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderColor,
        },
        ring === 'pending' && styles.pending,
        dimmed && { opacity: 0.85 },
      ]}>
      {ring !== 'pending' && (
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      <AppText
        variant="bodyStrong"
        tone={ring === 'pending' ? 'faint' : 'primary'}
        style={{ fontSize: Math.round(diameter * 0.36), lineHeight: Math.round(diameter * 0.44) }}>
        {emoji ?? initial(name)}
      </AppText>
    </View>
  );

  if (ring === 'none' || ring === 'pending') {
    return <View style={style}>{body}</View>;
  }

  return (
    <View style={[styles.ringBox, style]}>
      <ActivityRing diameter={diameter + 8} kind={ring} />
      {body}
    </View>
  );
}

/**
 * 아바타 뒤의 링.
 *
 * 디자인은 conic 그라데이션인데 RN에는 conic이 없다. 4스톱 선형 그라데이션을
 * 원형 테두리에 두르는 근사로 대신한다 — 스펙이 허용한 대체안이다.
 */
function ActivityRing({ diameter, kind }: { diameter: number; kind: 'activity' | 'achievement' }) {
  const palette = kind === 'achievement' ? gradients.achievementRing.colors : gradients.avatarRing.colors;

  return (
    <LinearGradient
      colors={palette as unknown as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        position: 'absolute',
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
      }}
    />
  );
}

/**
 * 겹쳐 놓은 아바타들 — "이 사람들이 이걸 같이 쓴다".
 *
 * 먼저 온 사람이 위에 오도록 zIndex를 내림차순으로 준다.
 */
export function AvatarStack({
  members,
  max = 4,
  size = 'micro',
  surfaceColor,
}: {
  members: { id: string; name?: string; emoji?: string }[];
  max?: number;
  size?: AvatarSize;
  surfaceColor: string;
}) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  const diameter = layout.avatar[size];

  return (
    <View style={styles.stack}>
      {shown.map((member, index) => (
        <View
          key={member.id}
          style={{
            marginLeft: index === 0 ? 0 : layout.avatarStackOverlap,
            zIndex: shown.length - index,
          }}>
          <Avatar {...member} size={size} borderColor={surfaceColor} />
        </View>
      ))}

      {overflow > 0 && (
        <View
          style={[
            styles.overflow,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              marginLeft: layout.avatarStackOverlap,
              borderColor: surfaceColor,
            },
          ]}>
          <AppText variant="badge" tone="body" font="display">
            +{overflow}
          </AppText>
        </View>
      )}
    </View>
  );
}

function initial(name?: string): string {
  return name?.trim().charAt(0) || '·';
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
  },
  pending: {
    backgroundColor: hexToRgba('#FFFFFF', 0.06),
    borderStyle: 'dashed',
    borderColor: colors.border.dashed,
  },
  ringBox: { alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  overflow: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRgba('#FFFFFF', 0.1),
    borderWidth: 2,
  },
});
