import { StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components/ui';
import { borders, colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';
import {
  avatarAngles,
  avatarPosition,
  avatarSizeFor,
  ringRadius,
  ringStroke,
  visibleSeats,
} from '@/lib/orbit';

/**
 * 링 위의 자리들.
 *
 * 사람은 링 **옆의 목록**이 아니라 링 **위**에 있다. 그게 이 제품이 "같이 쓴다"를
 * 말하는 방식이라 목록으로 대체하면 안 된다(MASTER_HANDOFF의 시각 정체성).
 *
 * 빈 자리(점선)는 초대장이지 망신 주기가 아니다 — 아직 참여하지 않았거나 준비가
 * 안 된 사람의 자리이며, 그 이상의 의미를 주지 않는다.
 */
export type Seat = {
  id: string;
  name?: string;
  emoji?: string;
  /** 아직 참여하지 않았거나 준비되지 않은 사람 */
  pending?: boolean;
  /** 활동 링. 히어로에서는 나 자신에게만 붙인다. */
  ring?: 'none' | 'activity' | 'achievement';
};

type OrbitSeatsProps = {
  seats: Seat[];
  size: number;
  /** 링 위(기본)냐, 바깥 점선 위(온보딩의 큰 오빗)냐 */
  placement?: 'stroke' | 'outer';
  variant?: 'today' | 'detail';
  /** 자리가 올라앉은 표면 색. 아바타 테두리에 그대로 쓴다. */
  surfaceColor?: string;
  strokeRatio?: number;
  /** 인원별 자동 크기를 무시하고 고정한다 (온보딩의 36/38/40px 자리) */
  seatSize?: number;
};

export function OrbitSeats({
  seats,
  size,
  placement = 'stroke',
  variant = 'today',
  surfaceColor = colors.background.base,
  strokeRatio = borders.orbitStrokeRatio,
  seatSize,
}: OrbitSeatsProps) {
  const { shown, overflow } = visibleSeats(seats);
  const count = shown.length + (overflow > 0 ? 1 : 0);

  const stroke = ringStroke(size, strokeRatio);
  const radius = placement === 'outer' ? size / 2 - 8 : ringRadius(size, stroke);
  const diameter = seatSize ?? avatarSizeFor(count, variant);
  const angles = avatarAngles(count);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {shown.map((seat, index) => {
        const { x, y } = avatarPosition(angles[index], radius);

        return (
          <View
            key={seat.id}
            style={{
              position: 'absolute',
              left: size / 2 + x - diameter / 2,
              top: size / 2 + y - diameter / 2,
            }}>
            <Avatar
              id={seat.id}
              name={seat.name}
              emoji={seat.pending ? undefined : seat.emoji}
              size={diameter}
              ring={seat.pending ? 'pending' : (seat.ring ?? 'none')}
              borderColor={surfaceColor}
            />
          </View>
        );
      })}

      {overflow > 0 &&
        (() => {
          const { x, y } = avatarPosition(angles[angles.length - 1], radius);
          return (
            <View
              style={[
                styles.overflow,
                {
                  left: size / 2 + x - diameter / 2,
                  top: size / 2 + y - diameter / 2,
                  width: diameter,
                  height: diameter,
                  borderRadius: diameter / 2,
                  borderColor: surfaceColor,
                },
              ]}>
              <AppText variant="badge" tone="body" font="display">
                +{overflow}
              </AppText>
            </View>
          );
        })()}
    </View>
  );
}

const styles = StyleSheet.create({
  overflow: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRgba('#FFFFFF', 0.1),
    borderWidth: 2,
  },
});
