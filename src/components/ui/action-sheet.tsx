import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { colors, motion, radius as radii } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 아래에서 올라오는 선택지 몇 개.
 *
 * `Alert`을 대신한다. 이유가 둘이다. **Android의 `Alert`은 버튼을 셋까지만 받고
 * 넷째부터는 조용히 사라진다** — 항목이 늘어날 자리(그룹 메뉴, 멤버 고르기)에
 * 그걸 쓰면 어느 날 조용히 기능이 없어진다. 그리고 시스템 알림창은 이 앱의
 * 화면이 아니다. 어두운 표면과 둥근 모서리가 여기서 끊긴다.
 *
 * 되돌릴 수 없는 확인에도 쓴다. 그때는 `message`로 무슨 일이 벌어지는지 적고
 * 실행 항목에 `danger`를 준다. 브레이크는 시스템 창의 낯섦이 아니라 **읽고 나서
 * 한 번 더 눌러야 한다는 사실**이다 — 취소가 언제나 손가락에 가장 가깝다.
 *
 * `Alert`은 실패를 알릴 때만 남는다. 그건 확인이 아니라 사고이고, 시트는 이미
 * 닫힌 뒤다.
 *
 * 애니메이션은 시트만 올라온다. `Modal`의 `animationType="slide"`는 배경 막까지
 * 함께 밀어 올려서 어둠이 아래에서 닦아 올라오는 것처럼 보인다.
 */
export type SheetAction = {
  label: string;
  onPress: () => void;
  /** 되돌리기 어려운 항목. 빨갛게 그린다. */
  danger?: boolean;
};

export function ActionSheet({
  visible,
  title,
  message,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  /** 무슨 일이 벌어지는지. 되돌릴 수 없는 확인에서는 이게 본문이다. */
  message?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  /*
   * 닫고 나서 실행한다.
   *
   * 항목 대부분이 화면을 옮기거나 확인창을 띄우는데, 시트가 아직 떠 있는 동안
   * 그러면 iOS에서 새 화면이 사라지는 모달 뒤에 깔린다. 순서를 뒤집는 것으로
   * 충분하다 — `visible`이 false가 된 다음 프레임에 부른다.
   */
  const run = (action: SheetAction) => {
    onClose();
    requestAnimationFrame(action.onPress);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        style={styles.backdrop}
        onPress={onClose}
      />

      <Animated.View
        entering={SlideInDown.duration(motion.duration.normal)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        {/*
          제목은 가운데, 본문은 왼쪽이다. 제목은 한 줄이라 가운데가 시트의 머리처럼
          앉지만, 본문은 두 문단이 되는 순간 줄 끝이 들쭉날쭉해져서 읽는 눈이 매
          줄 시작점을 다시 찾아야 한다.
        */}
        {(title || message) && (
          <View style={styles.head}>
            {title && (
              <AppText
                variant={message ? 'bodyStrong' : 'metadata'}
                tone={message ? 'primary' : 'faint'}
                style={styles.title}>
                {title}
              </AppText>
            )}
            {message && (
              <AppText variant="metadata" tone="metadata" style={styles.message}>
                {message}
              </AppText>
            )}
          </View>
        )}

        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            onPress={() => run(action)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <AppText variant="bodyStrong" tone={action.danger ? 'over' : 'primary'}>
              {action.label}
            </AppText>
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.row, styles.cancel, pressed && styles.pressed]}>
          <AppText variant="bodyStrong" tone="muted">
            취소
          </AppText>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    marginTop: 'auto',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopLeftRadius: radii.heroCard,
    borderTopRightRadius: radii.heroCard,
    backgroundColor: colors.surface.elevated,
    borderTopWidth: 1,
    borderColor: colors.border.hairlineStrong,
    gap: 10,
  },
  head: { gap: 8, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 10 },
  title: { textAlign: 'center' },
  message: { lineHeight: 20 },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radii.listRow,
    backgroundColor: hexToRgba('#FFFFFF', 0.03),
  },
  cancel: { marginTop: 2, backgroundColor: 'transparent' },
  pressed: { opacity: 0.6 },
});
