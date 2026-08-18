import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { colors, gradients, layout, opacity, radius as radii } from '@/constants/design-tokens';
import { hexToRgba } from '@/lib/color';

/**
 * 하단 네비게이션 넷.
 *
 * 아이콘은 폰트도 SVG도 아닌 그냥 `<View>`다(ASSET_MANIFEST). 모서리 둥근 사각형,
 * 링, 막대 셋, 원 — 전부 border-radius로 그려지는 모양이라 에셋을 늘릴 이유가 없다.
 *
 * 배경은 스크림 그라데이션이고 **네비게이터가 아니라 이 컴포넌트가 갖는다.**
 * 탭 바를 투명하게 두고 여기서 그려야 스크롤 내용이 아래로 사라지는 것처럼 보인다.
 *
 * 탭마다 강조색이 다르다 — 오늘 보라, 목표 파랑, 활동 시안, MY 연보라.
 */
const TABS = [
  { name: 'index', label: 'Today', accent: colors.accent.violet, tint: colors.accent.violetPale },
  { name: 'goals', label: 'Goals', accent: colors.accent.blue, tint: colors.accent.bluePale },
  { name: 'activity', label: 'Activity', accent: colors.accent.cyan, tint: colors.accent.cyanPale },
  { name: 'my', label: 'MY', accent: colors.accent.violetSoft, tint: colors.accent.violetTint },
] as const;

export function BottomNavigation({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { height: layout.bottomNavHeight + insets.bottom }]}
      pointerEvents="box-none">
      <LinearGradient
        colors={gradients.navScrim.colors as [string, string]}
        locations={gradients.navScrim.stops as [number, number]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((candidate) => candidate.name === route.name);
          if (!tab) return null;

          const focused = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={[
                styles.item,
                focused && {
                  backgroundColor: hexToRgba(tab.accent, 0.16),
                  borderColor: hexToRgba(tab.tint, 0.28),
                  borderWidth: 1,
                },
                focused && Platform.OS === 'ios' && styles.selectedGlow,
              ]}>
              <View style={!focused && styles.inactive}>
                <TabIcon name={route.name} color={focused ? tab.tint : colors.text.primary} />
              </View>
              {/* 선택된 탭만 강조색을 갖는다. 나머지는 흰 글자를 흐리게 둘 뿐이다. */}
              <AppText
                variant="badge"
                font="display"
                style={[
                  styles.label,
                  focused ? { color: tab.tint } : styles.inactive,
                ]}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 아이콘 넷. 전부 `<View>` 모양이다. */
function TabIcon({ name, color }: { name: string; color: string }) {
  if (name === 'index') {
    return (
      <LinearGradient
        colors={gradients.violetToBlue.colors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.18 }}
        style={styles.roundedSquare}
      />
    );
  }

  if (name === 'goals') {
    return <View style={[styles.ring, { borderColor: color }]} />;
  }

  if (name === 'activity') {
    return (
      <View style={styles.bars}>
        {[9, 16, 12].map((height, index) => (
          <View key={index} style={[styles.bar, { height, backgroundColor: color }]} />
        ))}
      </View>
    );
  }

  return <View style={[styles.disc, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: radii.navPill,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
  },
  selectedGlow: {
    shadowColor: colors.accent.violet,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  inactive: { opacity: opacity.navInactive },
  label: { fontSize: 11 },
  roundedSquare: { width: 18, height: 18, borderRadius: 6 },
  ring: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18 },
  bar: { width: 3, borderRadius: 1.5 },
  disc: { width: 18, height: 18, borderRadius: 9 },
});
