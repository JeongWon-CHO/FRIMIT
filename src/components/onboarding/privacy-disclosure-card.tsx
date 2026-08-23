import { StyleSheet, View } from 'react-native';

import { AppText, StatusDot, Surface } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 보이는 것 / 보이지 않는 것.
 *
 * 이 두 장이 05 화면의 전부이고, 이 화면이 권한을 얻어 낸다.
 *
 * **두 장의 무게는 같다.** 예전에는 `visible` 쪽만 시안 테두리와 블룸을 달고
 * `hidden` 쪽은 점선에 흐린 표면이었는데, 그러면 아래 카드로 눈이 가지 않는다.
 * 그런데 이 화면에서 사람을 안심시키는 절반은 오히려 아래쪽이다 — 무엇이 나가지
 * **않는지**가 권한을 켜게 만든다.
 *
 * 구분은 껍데기가 아니라 내용에 남긴다: 눈썹의 점과 글자 색, 그리고 목록 글자를
 * 일부러 읽기 어렵게 둔 것. 앱 목록이 기기 밖으로 나가지 않는다는 말은 그 셋이
 * 이미 하고 있고, 네 번째로 카드 껍데기까지 흐릴 이유가 없다.
 *
 * **여기 실데이터를 넣으면 안 된다.** 예시 문자열 셋은 고정이다. 사용자의 실제
 * 앱을 보여주는 순간 이 화면이 약속하는 바로 그것을 깨뜨린다.
 */
type Props = {
  tone: 'visible' | 'hidden';
  eyebrow: string;
  headline?: string;
  chips?: string[];
  rows?: { label: string; value: string }[];
  note?: string;
};

export function PrivacyDisclosureCard({ tone, eyebrow, headline, chips, rows, note }: Props) {
  const visible = tone === 'visible';

  return (
    <Surface
      fill={['#0C1418', '#09090F']}
      border={hexToRgba(colors.accent.cyan, 0.2)}
      cornerRadius={26}
      padding={18}
      style={styles.card}>
      <View style={styles.eyebrowRow}>
        <StatusDot color={visible ? colors.accent.cyan : colors.text.disabled} />
        <AppText variant="eyebrow" tone={visible ? 'cyan' : 'faint'}>
          {eyebrow}
        </AppText>
      </View>

      {headline && (
        <AppText variant="screenTitle" style={styles.headline}>
          {headline}
        </AppText>
      )}

      {chips && (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip} style={styles.chip}>
              <AppText variant="metadata" tone="body">
                {chip}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {rows?.map((row) => (
        <View key={row.label} style={styles.row}>
          <AppText variant="bodyStrong" style={styles.hiddenText}>
            {row.label}
          </AppText>
          <AppText variant="bodyStrong" style={styles.hiddenText}>
            {row.value}
          </AppText>
        </View>
      ))}

      {note && (
        <AppText variant="metadata" tone="metadata">
          {note}
        </AppText>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { fontSize: 32, lineHeight: 36 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  // 읽기 어려운 것이 메시지다. 대비를 올리면 이 카드가 하려는 말이 사라진다.
  hiddenText: { fontSize: 15, color: 'rgba(255,255,255,0.22)' },
});
