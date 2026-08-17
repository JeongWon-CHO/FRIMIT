import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

/**
 * 활동 탭 — 자리표시자.
 *
 * plan.md 6단계(활동 피드, 반응·콕 찌르기)에서 채운다. 서버에는 `activity_events`가
 * 아직 없다 — 마이그레이션도 이 단계에서 함께 만든다.
 */
export default function ActivityScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">활동</ThemedText>
      <Card>
        <ThemedText type="metric">조용해요</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          한도 75·90·100% 도달, 초과, 목표 기록, 멤버·규칙 변경이 그룹 통합 피드로 여기에 쌓여요.
          이모지 반응과 콕 찌르기도 이 화면에서 해요.
        </ThemedText>
      </Card>
    </Screen>
  );
}
