import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 여섯 자리 초대 코드 입력.
 *
 * 보이는 것은 상자 여섯 개지만 실제 입력은 뒤에 숨은 `TextInput` 하나다. 상자마다
 * 입력을 두면 붙여넣기와 백스페이스가 전부 특수 처리를 요구한다.
 *
 * **코드는 숫자 여섯 자리다.** 디자인의 `FRM-` 접두사는 표시용 장식이고, 서버
 * 제약은 `^[0-9]{6}$`이라 입력에서는 숫자만 받는다.
 */
export function CodeEntryField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  return (
    <Pressable accessibilityRole="none" onPress={() => input.current?.focus()}>
      <View style={styles.row}>
        {digits.map((digit, index) => {
          const filled = digit.trim().length > 0;
          const next = index === value.length;

          return (
            <View
              key={index}
              style={[
                styles.box,
                filled && styles.boxFilled,
                next && styles.boxNext,
                error && styles.boxError,
              ]}>
              <AppText variant="cardTitle" font="mono" tone={filled ? 'cyan' : 'faint'}>
                {digit.trim()}
              </AppText>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={6}
        style={styles.hidden}
        accessibilityLabel="초대 코드"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  box: {
    width: 34,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  boxFilled: { borderColor: hexToRgba(colors.accent.cyan, 0.28) },
  boxNext: { borderColor: hexToRgba(colors.accent.cyan, 0.28) },
  boxError: { borderColor: colors.state.overLimit },
  // 화면 밖으로 밀지 않는다 — 그러면 iOS에서 키보드가 열리지 않는 경우가 있다.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
