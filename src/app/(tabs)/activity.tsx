import { AppText, EmptyState, ScreenFrame } from '@/components/ui';
import { colors } from '@/constants/design-tokens';

import { TitleRow } from '@/components/title-row';

/**
 * 활동 탭.
 *
 * 목표 탭과 같은 이유로 비어 있다 — `activity_events` 테이블이 없다. 이모지
 * 반응과 콕 찌르기는 그 위에 푸시 발송까지 필요해서 더 멀다.
 *
 * 조용한 사건 흐름이지 피드 카드가 아니다. 나중에 채울 때도 그 성격을 지킨다.
 */
export default function ActivityScreen() {
  return (
    <ScreenFrame
      ambient={{ color: colors.accent.cyan, size: 380, opacity: 0.22, x: 330, y: 140 }}>
      <TitleRow title="Activity" />

      <EmptyState
        title="오늘은 조용하네요"
        body="한도 75·90·100% 도달, 초과, 목표 기록, 멤버·규칙 변경이 그룹 통합 흐름으로 여기에 쌓여요."
      />

      <AppText variant="metadata" tone="faint" style={{ textAlign: 'center' }}>
        곧 열려요
      </AppText>
    </ScreenFrame>
  );
}
