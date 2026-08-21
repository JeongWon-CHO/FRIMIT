import { StyleSheet, View } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';
import { toBars } from '@/lib/history-view';
import type { RecentDay } from '@/lib/history';

/**
 * 최근 이레(plan.md 82행).
 *
 * 숫자를 늘어놓지 않는다. 이 자리가 답해야 하는 질문은 "지난주에 몇 초를 썼나"가
 * 아니라 **"우리가 요즘 어떤가"**이고, 그건 막대 일곱 개의 모양이 한눈에 말한다.
 *
 * 히어로보다 작고 조용해야 한다. 후광도 그라데이션도 없다 — 이 카드가 위의
 * 게이지보다 눈에 띄면 잘못된 것이다(COMPONENT_SPEC의 PersonalLimitCard 규칙).
 */
const BAR_HEIGHT = 64;

export function RecentDays({ days }: { days: RecentDay[] | undefined }) {
  // 읽는 중에는 자리만 잡아 둔다. 빈 막대가 잠깐 떴다가 채워지는 편이,
  // 카드가 통째로 나타나며 아래 내용을 밀어내는 것보다 낫다.
  const bars = toBars(days ?? []);

  return (
    <Surface
      fill={hexToRgba('#FFFFFF', 0.03)}
      border={colors.border.subtle}
      cornerRadius={22}
      padding={14}
      style={styles.card}>
      <AppText variant="eyebrow" tone="faint">
        최근 7일
      </AppText>

      <View style={styles.row}>
        {bars.length === 0
          ? Array.from({ length: 7 }, (_, index) => <View key={index} style={styles.column} />)
          : bars.map((bar) => (
              <View key={bar.dateKey} style={styles.column}>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        height: `${Math.max(2, bar.ratio * 100)}%`,
                        backgroundColor: bar.over
                          ? colors.state.overLimit
                          : hexToRgba(colors.accent.violetSoft, bar.today ? 0.55 : 0.85),
                      },
                    ]}
                  />
                </View>

                <AppText variant="metadata" tone={bar.today ? 'body' : 'faint'}>
                  {bar.label}
                </AppText>
              </View>
            ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  column: { alignItems: 'center', gap: 6, flex: 1 },
  track: {
    width: 12,
    height: BAR_HEIGHT,
    borderRadius: 6,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { width: '100%', borderRadius: 6 },
});
