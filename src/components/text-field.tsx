import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 한 줄 입력.
 *
 * 닉네임과 초대 코드에 쓴다. 두 값은 성질이 반대라 `mono`로 갈린다 —
 * 초대 코드는 사람이 옮겨 적는 6자리 기계 값이므로 자폭이 일정해야 하고,
 * 닉네임은 사람이 고른 이름이라 본문 서체가 맞다.
 */
type TextFieldProps = TextInputProps & {
  label: string;
  /** 입력 아래 한 줄. 규칙(글자 수, 자릿수)이나 오류 사유를 적는다. */
  hint?: string;
  error?: string | null;
  mono?: boolean;
};

export function TextField({ label, hint, error, mono, style, ...rest }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      <ThemedText type="label" themeColor="textSecondary">
        {label}
      </ThemedText>

      <TextInput
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.over : theme.border,
          },
          mono && styles.mono,
          style,
        ]}
        placeholderTextColor={theme.textSecondary}
        {...rest}
      />

      {(error || hint) && (
        <ThemedText type="small" themeColor={error ? 'over' : 'textSecondary'}>
          {error || hint}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.two },
  input: {
    minHeight: 52,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
    fontWeight: '500',
  },
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
  },
});
