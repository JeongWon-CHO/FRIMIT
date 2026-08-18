import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bloom } from '@/components/ui/bloom';
import { DotTexture } from '@/components/ui/dot-texture';
import { colors, spacing } from '@/constants/design-tokens';

/**
 * 화면 한 장의 바깥 틀 — 배경, 질감, 화면 단위 블룸 하나, 안전영역, 패딩.
 *
 * 목업의 64/20/108은 54px 상태바를 전제한 값이다. 실기기에서는 `insets.top + 10`이
 * 그 자리를 대신하고(RN_IMPLEMENTATION_NOTES), 아래는 108 + inset을 그대로 비운다 —
 * 하단 네비게이션이 104 + inset로 자라기 때문이다.
 *
 * 온보딩은 좌우 26에 `space-between` 리듬을 쓴다. 그 차이만 prop으로 받는다.
 */
type ScreenFrameProps = {
  children: ReactNode;
  /** 온보딩은 26, 코어 화면은 20 */
  horizontal?: number;
  /** 하단 네비가 없는 화면(그룹 상세, 온보딩)은 여백을 줄인다. */
  bottomInset?: number;
  texture?: 'screen' | 'calm' | 'none';
  /** 화면 단위 블룸 하나. 화면당 최대 하나다. */
  ambient?: { color: string; size: number; opacity: number; x: number; y: number } | null;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 아래에 고정되는 CTA 블록. 온보딩의 `space-between` 리듬이 여기서 나온다. */
  footer?: ReactNode;
};

export function ScreenFrame({
  children,
  horizontal = spacing.screenHorizontal,
  bottomInset = spacing.contentBottom,
  texture = 'screen',
  ambient = null,
  scroll = true,
  onRefresh,
  refreshing,
  footer,
}: ScreenFrameProps) {
  const insets = useSafeAreaInsets();

  const padding = {
    paddingTop: insets.top + 10,
    paddingHorizontal: horizontal,
    paddingBottom: bottomInset + (footer ? 0 : insets.bottom),
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padding, styles.content]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.text.secondary}
          />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[padding, styles.content, styles.fill]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      {texture !== 'none' && <DotTexture tile={texture === 'calm' ? 'calm' : 'screen'} />}
      {ambient && <Bloom {...ambient} />}

      {body}

      {footer && (
        <View
          style={[
            styles.footer,
            { paddingHorizontal: horizontal, paddingBottom: Math.max(insets.bottom, 24) + 16 },
          ]}>
          {footer}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.base },
  content: { gap: spacing.sectionGap },
  fill: { flex: 1 },
  footer: { paddingTop: 12, gap: 10 },
});
