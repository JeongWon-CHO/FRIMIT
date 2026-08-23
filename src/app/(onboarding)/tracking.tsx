import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SharedOrbitRing } from '@/components/orbit';
import { OnboardingFrame, PrivacyDisclosureCard, StepProgress } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton, StatusPill } from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';
import { useMyGroups } from '@/hooks/use-groups';
import { useScreenGroup } from '@/hooks/use-screen-group';
import { useTrackingState } from '@/hooks/use-tracking';
import { hexToRgba } from '@/lib/color';
import {
  armTracking,
  listInstalledApps,
  pickTargetsIOS,
  readSelectedPackages,
  saveSelectedPackages,
} from '@/lib/tracking';
import type { SelectableApp } from '@modules/screen-time';

/**
 * 11 · 추적 대상 설명 → 12 · 선택 결과.
 *
 * 두 플랫폼이 근본적으로 다르다. iOS는 애플이 그리는 `FamilyActivityPicker`를 띄우고
 * 우리는 불투명한 토큰만 받는다 — 무엇을 골랐는지 앱이 알 수 없다. **Android에는
 * 그런 시스템 UI가 아예 없어서** 설치 앱 목록을 우리가 직접 보여준다. 디자인은
 * "커스텀 앱 목록을 만들지 말 것"이라고 못 박았지만 그건 iOS를 전제한 규칙이고,
 * Android에서는 지킬 수 없다. 그 차이를 감추지 않는다.
 *
 * 결과 화면은 **개수만** 보여준다. 플랫폼이 읽을 수 있더라도 목록을 늘어놓지 않는다.
 */
const VISIBLE_APP_LIMIT = 40;

export default function TrackingScreen() {
  const { groupId, edit } = useLocalSearchParams<{ groupId?: string; edit?: string }>();
  // MY 탭에서 고치러 온 경우. 저장하면 온보딩 다음 단계가 아니라 왔던 자리로 돌아간다.
  const editing = edit === '1';
  const groups = useMyGroups();
  // 방금 만든 그룹의 id를 받아서 온다. 목록의 첫 그룹으로 떨어지면 이미 그룹이
  // 있는 사람이 **엉뚱한 그룹의 추적 대상**을 고르게 된다.
  const group = useScreenGroup(groups.data, groupId);
  const tracking = useTrackingState(group?.id);

  const [apps, setApps] = useState<SelectableApp[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 방금 고른 결과.
   *
   * `presentSelection`은 저장을 마친 뒤 **그 자리에서 센 개수**를 돌려준다. 그걸
   * 버리고 `getSelectionSummary`로 다시 읽으면 같은 값을 한 번 더 묻는 셈인데,
   * 다시 고르기로 앱을 더한 직후에는 그 재조회가 옛 개수를 준다. 화면은 2를
   * 그대로 두고, 다음 화면에 가서야 4가 나온다.
   *
   * 그래서 돌려받은 값을 우선한다. 아직 한 번도 고르지 않았으면 null이고, 그때는
   * 기기에 저장된 값을 읽는다(다른 기기에서 고르고 온 경우).
   */
  const [pickedCount, setPickedCount] = useState<number | null>(null);
  const selectionCount = pickedCount ?? tracking.selectionCount;

  const chosen = selectionCount > 0;

  useEffect(() => {
    if (Platform.OS !== 'android' || !group) return;

    let cancelled = false;
    (async () => {
      try {
        const [installed, mirrored] = await Promise.all([
          listInstalledApps(),
          readSelectedPackages(group.id),
        ]);
        if (cancelled) return;
        setApps(installed);
        setSelected(mirrored);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [group]);

  const visible = useMemo(() => {
    if (!apps) return [];
    const needle = query.trim().toLowerCase();
    const matched = needle ? apps.filter((app) => app.label.toLowerCase().includes(needle)) : apps;

    // 고른 것은 위로. 스크롤을 내리다 자기가 뭘 골랐는지 잊게 하지 않는다.
    return [...matched].sort(
      (left, right) =>
        Number(selected.includes(right.packageName)) - Number(selected.includes(left.packageName))
    );
  }, [apps, query, selected]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      tracking.refresh();
      setBusy(false);
    }
  };

  const openPicker = () =>
    run(async () => {
      if (!group) return;
      const count = await pickTargetsIOS(group.id);
      setPickedCount(count);
      // 그룹이 아직 시작 전이면 서버가 스냅샷을 거절하지만 기기 쪽 집계는 미리
      // 돌아도 무해하고, 시작되는 순간부터 값이 바로 쌓인다.
      if (count > 0) await armTracking(group.id, group.time_zone);
    });

  const saveAndroid = () =>
    run(async () => {
      if (!group) return;
      const count = await saveSelectedPackages(group.id, selected);
      setPickedCount(count);
      if (count > 0) await armTracking(group.id, group.time_zone);
    });

  const leave = () => {
    if (!editing) {
      router.push({ pathname: '/ready', params: group ? { groupId: group.id } : {} });
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const skip = leave;

  // ── 12 · 선택 결과 ─────────────────────────────────────────────
  if (chosen) {
    return (
      <OnboardingFrame
        footer={
          <ButtonStack>
            <GradientButton
              label="다시 고르기"
              variant="secondary"
              onPress={
                Platform.OS === 'ios'
                  ? openPicker
                  : () => setSelectionAgain(tracking.refresh, { groupId, edit })
              }
            />
            <GradientButton label="이대로 좋아요" onPress={leave} />
          </ButtonStack>
        }>
        <View style={styles.navRow}>
          <AppText variant="numericLabel" tone="faint">
            {group?.name ?? '이 그룹'}
          </AppText>
          {!editing && <StepProgress total={4} current={3} />}
        </View>

        <View style={styles.center}>
          <SharedOrbitRing
            size={190}
            progress={0.86}
            gradient={gradients.sharedPool.colors}
            strokeRatio={0.13}>
            <AppText variant="heroNumber" style={styles.count}>
              {selectionCount}
            </AppText>
            <AppText variant="bodyStrong" tone="metadata">
              우리 시간에 포함된 앱
            </AppText>
          </SharedOrbitRing>

          <AppText variant="body" tone="muted" style={styles.caption}>
            고른 앱을 쓰는 시간만{'\n'}
            {group?.name ?? '우리 그룹'}의 공동 시간에 더해져요.
          </AppText>
        </View>

        <View />
      </OnboardingFrame>
    );
  }

  // ── 11 · 설명 ─────────────────────────────────────────────────
  return (
    <OnboardingFrame
      footer={
        <ButtonStack>
          {error && (
            <AppText variant="metadata" tone="over">
              {error}
            </AppText>
          )}
          {Platform.OS === 'ios' ? (
            <GradientButton
              label="앱 고르기"
              onPress={openPicker}
              loading={busy}
              disabled={!group}
            />
          ) : (
            <GradientButton
              label={selected.length > 0 ? `${selected.length}개 저장하기` : '앱을 골라 주세요'}
              onPress={saveAndroid}
              loading={busy}
              disabled={!group || selected.length === 0}
            />
          )}
          <GradientButton label="나중에 하기" variant="tertiary" onPress={skip} />
          <AppText variant="metadata" tone="faint" style={styles.note}>
            {Platform.OS === 'ios'
              ? '시스템 앱 선택 화면이 열려요.'
              : '이 기기에서는 설치된 앱 목록에서 직접 골라요.'}
          </AppText>
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.navRow}>
          {group && <StatusPill label={group.name} dotColor={colors.accent.violetSoft} />}
          {!editing && <StepProgress total={4} current={3} />}
        </View>

        <AppText variant="screenTitle" style={styles.title}>
          무엇을 이 시간에{'\n'}포함할까요?
        </AppText>
        <AppText variant="body" tone="muted">
          이 그룹의 공동 시간으로 셀 앱을 직접 고르세요. 그룹마다 다르게 정할 수 있어요.
        </AppText>

        {Platform.OS === 'android' && (
          <>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="이름으로 검색"
              placeholderTextColor={colors.text.disabled}
              autoCorrect={false}
              style={styles.search}
              accessibilityLabel="앱 찾기"
            />

            {apps === null ? (
              <AppText variant="metadata" tone="metadata">
                설치된 앱을 읽고 있어요
              </AppText>
            ) : (
              <View style={styles.list}>
                {visible.slice(0, VISIBLE_APP_LIMIT).map((app) => {
                  const picked = selected.includes(app.packageName);
                  return (
                    <Pressable
                      key={app.packageName}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: picked }}
                      accessibilityLabel={app.label}
                      onPress={() =>
                        setSelected((prev) =>
                          picked
                            ? prev.filter((name) => name !== app.packageName)
                            : [...prev, app.packageName]
                        )
                      }
                      style={[styles.appRow, picked && styles.appRowOn]}>
                      <AppText variant="bodyStrong" numberOfLines={1} style={styles.appLabel}>
                        {app.label}
                      </AppText>
                      <AppText variant="metadata" tone={picked ? 'cyan' : 'metadata'}>
                        {picked ? '선택됨' : '선택'}
                      </AppText>
                    </Pressable>
                  );
                })}

                {visible.length > VISIBLE_APP_LIMIT && (
                  <AppText variant="metadata" tone="metadata">
                    {visible.length}개 중 {VISIBLE_APP_LIMIT}개만 보여요. 검색으로 좁혀 보세요.
                  </AppText>
                )}
              </View>
            )}
          </>
        )}

        {Platform.OS === 'ios' && (
          <PrivacyDisclosureCard
            tone="hidden"
            eyebrow="이 기기에만 남아요"
            note="고른 앱 목록은 이 기기에만 남아요. 친구들에게는 앱 개수와 총 시간만 보여요."
          />
        )}
      </View>

      <View />
    </OnboardingFrame>
  );
}

/**
 * Android에서 다시 고르려면 선택을 비우고 목록으로 돌아간다.
 *
 * 파라미터를 그대로 다시 넘긴다. 빠뜨리면 다시 고른 사람이 엉뚱한 그룹의 대상을
 * 고르거나(groupId), 저장 뒤 온보딩으로 끌려간다(edit).
 */
function setSelectionAgain(refresh: () => void, params: { groupId?: string; edit?: string }) {
  router.replace({ pathname: '/tracking', params });
  refresh();
}

const styles = StyleSheet.create({
  top: { gap: 22 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 30, lineHeight: 38 },
  center: { alignItems: 'center', gap: 20 },
  count: { fontSize: 64, lineHeight: 68, letterSpacing: -3.2 },
  caption: { textAlign: 'center', lineHeight: 22 },
  note: { textAlign: 'center' },
  search: {
    borderRadius: radii.button,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: hexToRgba('#FFFFFF', 0.05),
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
    color: colors.text.primary,
    fontSize: 15,
  },
  list: { gap: 8 },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: radii.listRow,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface.row,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  appRowOn: { borderColor: hexToRgba(colors.accent.cyan, 0.28) },
  appLabel: { flex: 1 },
});
