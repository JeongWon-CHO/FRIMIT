import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 초대 코드 카드.
 *
 * 복사했다는 확인을 시스템 토스트로 띄우지 않는다 — 카드 자신이 바뀌는 것이
 * 확인이다. 토스트는 화면 위에 얹히는 다른 레이어라 이 화면의 조용한 톤을 깬다.
 *
 * **코드는 숫자 여섯 자리다.** 디자인의 `FRM-` 접두사는 읽기 좋으라고 붙이는
 * 표시용이고, 복사되는 것은 접두사 없는 여섯 자리다 — 받는 쪽 입력칸이 숫자만 받는다.
 */
export function InviteCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Pressable accessibilityRole="button" onPress={copy} onLongPress={copy}>
      <Surface
        fill={colors.surface.row}
        border={copied ? hexToRgba(colors.accent.cyan, 0.5) : colors.border.hairline}
        cornerRadius={24}
        padding={18}
        style={styles.card}>
        <AppText variant="eyebrow" tone={copied ? 'cyan' : 'faint'}>
          {copied ? '복사했어요' : '초대 코드'}
        </AppText>
        <AppText variant="cardNumber" font="mono" style={styles.code}>
          FRM-{code}
        </AppText>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 10 },
  code: { fontSize: 30, lineHeight: 36, letterSpacing: 2.4, color: colors.accent.violetTint },
});
