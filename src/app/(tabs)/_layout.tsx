import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * 하단 탭 넷. plan.md 3장의 구성 그대로다.
 *
 * `expo-router/js-tabs`에서 가져온다 — SDK 57에서 `expo-router`의 `Tabs`는
 * deprecated 표시가 붙었고 이 경로가 같은 구현의 새 주소다.
 *
 * 지금은 오늘 탭만 실제로 동작하고 나머지 셋은 자리표시자다. 그래도 지금 세우는
 * 이유는, 탭 구조가 뒤에 바뀌면 모든 화면의 경로가 함께 바뀌기 때문이다.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘',
          tabBarIcon: ({ color, size }) => <Ionicons name="sunny" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: '목표',
          tabBarIcon: ({ color, size }) => <Ionicons name="flag" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: '활동',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: 'MY',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
