import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  router,
  useRootNavigationState,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { TABS_ROUTE, resolveEntryRoute } from '@/lib/onboarding';
import { queryClient } from '@/lib/query';

/**
 * 앱의 뿌리. 두 가지만 한다 — 캐시·테마를 깔고, 첫 화면을 정한다.
 *
 * 첫 화면 판정은 네트워크를 한 번 다녀오므로(익명 세션, 프로필, 그룹 목록) 그
 * 사이에 화면을 보여주면 안 된다. 기본 경로는 오늘 화면이므로, 판정 전에 그리면
 * 온보딩이 필요한 사용자에게 빈 오늘 화면이 한 번 번쩍인다. 스플래시를 직접
 * 붙잡아 두는 것으로 그 깜빡임을 없앤다.
 */

// 스플래시를 우리가 내릴 때까지 붙잡는다. 이 호출은 모듈 최초 평가 시점에 필요하다.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <EntryGate />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * 어디서 시작할지 정하고 스플래시를 내린다.
 *
 * `useRootNavigationState()`가 자리를 잡기 전에 `router.replace`를 부르면 그
 * 이동이 조용히 사라진다. 내비게이션이 준비된 뒤에만 판정을 시작한다.
 */
function EntryGate() {
  const navigationState = useRootNavigationState();
  const isNavigationReady = Boolean(navigationState?.key);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!isNavigationReady || settled) return;

    let cancelled = false;

    (async () => {
      try {
        const route = await resolveEntryRoute();
        if (!cancelled && route !== TABS_ROUTE) router.replace(route);
      } catch {
        // 비행기 모드에서 앱을 켠 경우가 여기다. 판정에 실패하면 오늘 화면에
        // 그대로 둔다 — 그 화면은 그룹이 없을 때와 읽기에 실패했을 때 각각
        // 무엇을 해야 하는지 스스로 안내한다. 온보딩으로 밀어 넣으면 이미
        // 온보딩을 마친 사용자가 자기 그룹을 못 보고 처음부터 다시 하게 된다.
      } finally {
        if (!cancelled) {
          setSettled(true);
          await SplashScreen.hideAsync();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNavigationReady, settled]);

  return null;
}
