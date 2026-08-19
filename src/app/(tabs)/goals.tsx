import { AppText, EmptyState, ScreenFrame } from '@/components/ui';
import { colors } from '@/constants/design-tokens';

import { TitleRow } from '@/components/title-row';

/**
 * 목표 탭.
 *
 * 껍데기만 새 디자인이고 안은 비어 있다 — **서버에 `goals` 테이블이 없다.**
 * 목표 카드, 기한, 멤버별 진행률은 전부 그릴 데이터가 없으므로 화면을 지어내는
 * 대신 무엇이 여기 들어올지 적어 둔다. 스키마는 이번 범위 밖이다.
 */
export default function GoalsScreen() {
  return (
    <ScreenFrame
      ambient={{ color: colors.accent.indigo, size: 380, opacity: 0.26, x: 60, y: 140 }}>
      <TitleRow title="Goals" />

      <EmptyState
        title="아직 목표가 없어요"
        body="그룹 하나에 공동 목표 하나를 걸고 7·14·30일 중에 기간을 골라요. 진행률은 각자의 달성률을 100%에서 끊어 평균한 값이에요."
      />

      <AppText variant="metadata" tone="faint" style={{ textAlign: 'center' }}>
        곧 만들 수 있어요
      </AppText>
    </ScreenFrame>
  );
}
