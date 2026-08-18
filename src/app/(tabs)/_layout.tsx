import { Tabs } from 'expo-router/js-tabs';

import { BottomNavigation } from '@/components/bottom-navigation';
import { colors } from '@/constants/design-tokens';

/**
 * 하단 탭 넷.
 *
 * `expo-router/js-tabs`에서 가져온다 — SDK 57에서 `expo-router`의 `Tabs`는
 * deprecated 표시가 붙었고 이 경로가 같은 구현의 새 주소다.
 *
 * **라우트 이름은 그대로 둔다.** 딥링크와 기존 `router.push('/')` 경로가 여기에
 * 걸려 있다. 바뀌는 것은 표현뿐이다.
 *
 * `sceneStyle`의 배경을 검정으로 두는 이유는 탭을 옮길 때 흰색이 한 프레임
 * 번쩍이기 때문이다. 화면 배경만 칠해서는 그 사이를 못 막는다.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomNavigation {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background.base },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="my" options={{ title: 'MY' }} />
    </Tabs>
  );
}
