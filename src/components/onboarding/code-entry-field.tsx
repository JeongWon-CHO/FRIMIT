import { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

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
 *
 * **이건 화면 하나를 차지해야 한다.** 07의 카드 안에 넣었더니 키보드가 올라오는
 * 순간 입력칸이 키보드와 버튼 사이에 끼어 보이지 않았다. 카드 두 장과 제목까지
 * 있는 화면에서 키보드가 절반을 먹으면 자리가 남지 않는다. 지금 실제 입력은 08이
 * 맡고, 07의 카드에는 그림(`CodeBoxes`)만 남는다.
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

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <View>
      <CodeBoxes value={value} error={error} />

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
    </View>
  );
}

/**
 * 상자 여섯 개. 입력은 받지 않는다.
 *
 * 07의 참여 카드가 이걸 쓴다 — 거기서 이 상자들은 "여기 코드를 넣는다"는 그림일
 * 뿐이고, 탭은 카드가 통째로 받아 08로 보낸다.
 */
export function CodeBoxes({ value, error }: { value: string; error?: boolean }) {
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  return (
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 7 },
  box: {
    width: 40,
    height: 52,
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
