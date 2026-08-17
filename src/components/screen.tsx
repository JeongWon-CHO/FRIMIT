import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 화면 하나의 바깥 틀. 배경·안전영역·스크롤·최대 폭을 한 곳에서 정한다.
 *
 * 온보딩은 아래에 버튼이 고정된 형태(`footer`)를 쓰고, 탭 화면은 당겨서 새로고침을
 * 쓴다. 두 경우 모두 바깥 여백 규칙은 같아야 하므로 컴포넌트를 나누지 않았다.
 */
type ScreenProps = {
  children: ReactNode;
  /** 화면 아래에 고정되는 영역. 온보딩의 다음 단계 버튼이 여기 들어간다. */
  footer?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 스크롤 없이 화면을 꽉 채우는 배치가 필요할 때. */
  scroll?: boolean;
};

export function Screen({ children, footer, onRefresh, refreshing, scroll = true }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const body = <View style={styles.inner}>{children}</View>;

  /**
   * 홈 인디케이터를 footer가 직접 피한다.
   *
   * `SafeAreaView`의 bottom edge로 처리하면 안전영역이 배경째 잘려 나가서, 버튼
   * 아래에 배경색이 끊긴 띠가 생긴다. footer는 화면 끝까지 이어지고 내용만 위로
   * 밀어 올리는 것이 맞다. 인디케이터가 없는 기기(Android 대부분)에서는 inset이
   * 0이므로 최소 여백을 따로 준다 — 그러지 않으면 버튼이 화면 끝에 붙는다.
   */
  const footerPadding = Math.max(insets.bottom, Spacing.three) + Spacing.two;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={Boolean(refreshing)}
                  onRefresh={onRefresh}
                  tintColor={theme.textSecondary}
                />
              ) : undefined
            }>
            {body}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fill]}>{body}</View>
        )}

        {footer ? (
          <View
            style={[
              styles.footer,
              { borderTopColor: theme.border, paddingBottom: footerPadding },
            ]}>
            <View style={styles.inner}>{footer}</View>
          </View>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  fill: { flex: 1 },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    // paddingBottom은 안전영역에 따라 런타임에 정한다.
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
});
