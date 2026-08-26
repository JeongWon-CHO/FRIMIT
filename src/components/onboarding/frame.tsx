import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { ScreenFrame } from '@/components/ui';

/**
 * 온보딩 화면 한 장.
 *
 * 좌우 26(코어는 20)에 `space-between` 리듬 — 위 블록, 가운데 그림, 아래 CTA.
 * **이 리듬이 열여섯 장을 하나의 제품으로 묶는다.** 화면마다 다르게 배치하면
 * 열여섯 장의 포스터가 된다.
 *
 * 어느 화면도 390×844에서 스크롤되지 않지만 전부 `ScrollView` 안에 둔다 —
 * 작은 기기와 큰 글자 설정에서 잘리는 대신 흐르게 하기 위해서다.
 */
export function OnboardingFrame({
  children,
  footer,
  texture = 'screen',
  ambient = null,
  onRefresh,
}: {
  children: ReactNode;
  footer?: ReactNode;
  texture?: 'screen' | 'calm' | 'none';
  ambient?: { color: string; size: number; opacity: number; x: number; y: number } | null;
  /** 남을 기다리는 화면(대기실)에만 있다. 나머지는 내 손 안의 값만 그린다. */
  onRefresh?: () => void | Promise<unknown>;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.fill}>
      <ScreenFrame
        horizontal={26}
        // 노치가 있는 기기에서 목업의 70은 제목을 상태바에 붙여 놓는다.
        // 온보딩은 제목이 화면의 첫 마디라 숨 쉴 자리를 더 준다.
        topSpace={28}
        bottomInset={24}
        texture={texture}
        ambient={ambient}
        fill
        footer={footer}
        onRefresh={onRefresh}>
        <View style={styles.body}>{children}</View>
      </ScreenFrame>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'space-between', gap: 26 },
});
