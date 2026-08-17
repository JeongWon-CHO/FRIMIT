import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

/**
 * 목표 탭 — 자리표시자.
 *
 * plan.md 6단계(공동 목표)에서 채운다. 지금 여기 있는 이유는 탭 구조를 먼저
 * 확정하기 위해서다. 채워질 것을 적어 두는 것이 "준비 중"보다 정직하다.
 */
export default function GoalsScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">목표</ThemedText>
      <Card>
        <ThemedText type="metric">아직 만들지 않았어요</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          그룹 하나에 공동 목표 하나를 걸고, 7·14·30일 중에 기간을 고르는 화면이 여기에 들어와요.
          진행률은 각자의 달성률을 100%에서 끊어 평균한 값이에요.
        </ThemedText>
      </Card>
    </Screen>
  );
}
