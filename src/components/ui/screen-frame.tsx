import * as Haptics from 'expo-haptics';
import { useCallback, useState, type ReactNode } from 'react';
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
  /** 안전영역 위에 더 얹는 여백. 목업의 70은 54px 상태바를 전제한 값이다. */
  topSpace?: number;
  /** 하단 네비가 없는 화면(그룹 상세, 온보딩)은 여백을 줄인다. */
  bottomInset?: number;
  texture?: 'screen' | 'calm' | 'none';
  /** 화면 단위 블룸 하나. 화면당 최대 하나다. */
  ambient?: { color: string; size: number; opacity: number; x: number; y: number } | null;
  scroll?: boolean;
  /** 내용이 짧아도 화면 높이를 채운다. 온보딩의 `space-between` 리듬에 필요하다. */
  fill?: boolean;
  /** 당겨서 새로고침. 인디케이터는 이 프레임이 직접 관리한다(아래 설명). */
  onRefresh?: () => void | Promise<unknown>;
  /** 아래에 고정되는 CTA 블록. 온보딩의 `space-between` 리듬이 여기서 나온다. */
  footer?: ReactNode;
};

export function ScreenFrame({
  children,
  horizontal = spacing.screenHorizontal,
  topSpace = 10,
  bottomInset = spacing.contentBottom,
  texture = 'screen',
  ambient = null,
  scroll = true,
  fill = false,
  onRefresh,
  footer,
}: ScreenFrameProps) {
  const insets = useSafeAreaInsets();

  /*
   * 인디케이터는 **사용자가 당겼을 때만** 돈다.
   *
   * 화면이 쓰는 쿼리의 `isFetching`을 그대로 넘기면, 사람이 손도 대지 않은
   * 백그라운드 갱신에도 목록이 아래로 끌려 내려간다. 활동 탭에서 이모지 하나를
   * 누를 때마다 화면이 덜컹인 것이 그 때문이었다.
   *
   * 그래서 상태를 화면에서 받지 않고 여기서 만든다. 넘겨받는 값이 없으면 잘못
   * 넘길 수도 없다.
   */
  const [pulling, setPulling] = useState(false);

  const pull = useCallback(async () => {
    if (!onRefresh) return;

    /*
     * 당김이 걸린 순간에 한 번. 다 됐을 때가 아니다 — 이건 "받았다"는 대답이고,
     * 끝났다는 말은 스피너가 멈추는 것으로 이미 한다. 두 번 치면 무슨 뜻인지
     * 흐려진다.
     *
     * 기다리지 않는다. 왕복 뒤에 오는 진동은 손을 뗀 지 한참 지나서 오므로
     * 내 동작의 대답으로 읽히지 않는다. 저전력 모드나 탭틱 엔진이 꺼진 기기,
     * 웹에서는 조용히 아무 일도 없다 — 스피너가 그 자리를 대신한다.
     */
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    setPulling(true);
    try {
      await onRefresh();
    } finally {
      setPulling(false);
    }
  }, [onRefresh]);

  /** 내용이 시작하는 높이. 스크롤 패딩과 새로고침 스피너가 같이 쓴다. */
  const contentTop = insets.top + topSpace;

  const padding = {
    paddingTop: contentTop,
    paddingHorizontal: horizontal,
    paddingBottom: bottomInset + (footer ? 0 : insets.bottom),
  };

  const body = scroll ? (
    <ScrollView
      // `flexGrow: 1`이 없으면 안쪽의 `flex: 1`과 `space-between`이 죽는다 —
      // 내용이 화면보다 짧을 때 전부 위로 몰리고 아래가 비어 버린다. 온보딩의
      // "위 블록 · 가운데 그림 · 아래 CTA" 리듬이 전부 이것에 걸려 있다.
      contentContainerStyle={[padding, styles.content, fill && styles.grow]}
      showsVerticalScrollIndicator={false}
      // 내용이 화면 안에 들어가는 화면에서 고무줄처럼 튀면 스크롤할 것이 있는
      // 줄 알고 계속 당겨 보게 된다.
      alwaysBounceVertical={!fill}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={pulling}
            onRefresh={pull}
            tintColor={colors.text.secondary}
            /*
             * 스피너는 `contentContainerStyle`의 패딩을 모른다 — ScrollView 프레임
             * 기준으로 자리를 잡는다. 이 프레임은 y=0부터, 즉 상태바 뒤부터
             * 시작하므로 그냥 두면 시계 옆에서 돈다. 실기기에서 "스피너가 아예
             * 없다"고 보인 것이 이것이었다.
             *
             * 그래서 내용의 시작점과 같은 값을 쓴다. 둘이 갈라지면 스피너만
             * 혼자 뜨므로 `contentTop` 하나에서 같이 나온다.
             */
            progressViewOffset={contentTop}
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
  grow: { flexGrow: 1 },
  fill: { flex: 1 },
  footer: { paddingTop: 12, gap: 10 },
});
