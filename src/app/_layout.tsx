import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider, router, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { colors } from '@/constants/design-tokens';
import { DEV_ROUTE } from '@/lib/dev-route';
import { TABS_ROUTE, resolveEntryRoute } from '@/lib/onboarding';
import { queryClient } from '@/lib/query';

/**
 * 앱의 뿌리. 두 가지만 한다 — 캐시·테마를 깔고, 첫 화면을 정한다.
 *
 * 첫 화면 판정은 네트워크를 한 번 다녀오므로(프로필, 그룹 목록) 그
 * 사이에 화면을 보여주면 안 된다. 기본 경로는 오늘 화면이므로, 판정 전에 그리면
 * 온보딩이 필요한 사용자에게 빈 오늘 화면이 한 번 번쩍인다. 스플래시를 직접
 * 붙잡아 두는 것으로 그 깜빡임을 없앤다.
 *
 * 폰트도 같은 문에 건다. 게이트를 따로 만들면 스플래시가 두 번 내려갈 기회가
 * 생기고, 그러면 시스템 폰트로 한 번 그린 뒤 Manrope로 다시 그리는 것이 보인다.
 */

// 스플래시를 우리가 내릴 때까지 붙잡는다. 이 호출은 모듈 최초 평가 시점에 필요하다.
SplashScreen.preventAutoHideAsync();

/** 디자인은 다크 전용이다. 내비게이션 테마도 배경만 우리 값으로 덮는다. */
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background.base,
    card: colors.background.base,
    text: colors.text.primary,
    border: colors.border.hairline,
    primary: colors.accent.violetSoft,
  },
};

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        <EntryGate />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.base },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * 어디서 시작할지 정하고, 폰트가 실린 뒤 스플래시를 내린다.
 *
 * `useRootNavigationState()`가 자리를 잡기 전에 `router.replace`를 부르면 그
 * 이동이 조용히 사라진다. 내비게이션이 준비된 뒤에만 판정을 시작한다.
 */
function EntryGate() {
  const navigationState = useRootNavigationState();
  const isNavigationReady = Boolean(navigationState?.key);
  // 개발용 강제 이동이 걸려 있으면 판정은 아예 돌리지 않는다. 돌리면 몇 백
  // 밀리초 뒤에 도착한 판정 결과가 우리를 다시 밀어낸다.
  const devRoute = __DEV__ ? DEV_ROUTE : null;
  const [routeSettled, setRouteSettled] = useState(Boolean(devRoute));

  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  // 폰트가 실패해도 앱을 붙잡아 두지 않는다. 한글은 어차피 시스템 얼굴로
  // 떨어지므로, 라틴 숫자가 시스템 서체로 나오는 것이 흰 화면보다 낫다.
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (!isNavigationReady) return;

    if (devRoute) {
      router.replace(devRoute as never);
      return;
    }

    if (routeSettled) return;

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
        if (!cancelled) setRouteSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNavigationReady, routeSettled, devRoute]);

  useEffect(() => {
    if (routeSettled && fontsSettled) SplashScreen.hideAsync();
  }, [routeSettled, fontsSettled]);


  return null;
}
