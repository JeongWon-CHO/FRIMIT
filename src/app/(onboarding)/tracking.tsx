import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { OnboardingStep } from '@/components/onboarding-step';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useMyGroups } from '@/hooks/use-groups';
import { useTheme } from '@/hooks/use-theme';
import { useTrackingState } from '@/hooks/use-tracking';
import { markProgress } from '@/lib/onboarding';
import {
  armTracking,
  listInstalledApps,
  pickTargetsIOS,
  readSelectedPackages,
  saveSelectedPackages,
} from '@/lib/tracking';
import type { SelectableApp } from '@modules/screen-time';

/** 한 번에 그리는 앱 줄 수. 90개를 다 그리면 스크롤이 무거워진다. */
const VISIBLE_APP_LIMIT = 40;

/**
 * 5단계 · 추적 대상 선택.
 *
 * 두 플랫폼이 근본적으로 다르다. iOS는 애플이 그리는 `FamilyActivityPicker`를
 * 띄우고 우리는 불투명한 토큰만 받는다 — 무엇을 골랐는지 앱이 알 수 없다.
 * Android에는 그런 시스템 UI가 없어서 설치 앱 목록을 우리가 직접 보여준다.
 * 그 차이를 감추지 않는다(모듈의 JS 표면도 같은 이유로 플랫폼별 API로 나뉘어 있다).
 *
 * 고른 뒤에 `armTracking`으로 이 구간을 무장한다. 그룹이 아직 시작 전이면 서버가
 * 스냅샷을 거절하지만(`group_not_collecting`) 기기 쪽 집계는 미리 돌아도 무해하고,
 * 그룹이 시작되는 순간부터 값이 바로 쌓인다.
 */
export default function TrackingScreen() {
  const groups = useMyGroups();
  const group = groups.data?.[0];
  const tracking = useTrackingState(group?.id);

  const [apps, setApps] = useState<SelectableApp[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android만 목록이 필요하다. 화면에 들어오면 바로 읽는다 — 90개 남짓이라 빠르다.
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
    const matched = needle
      ? apps.filter((app) => app.label.toLowerCase().includes(needle))
      : apps;

    // 고른 것은 위로. 스크롤을 내리다 자기가 뭘 골랐는지 잊게 하지 않는다.
    return [...matched].sort((left, right) => {
      const leftPicked = selected.includes(left.packageName) ? 0 : 1;
      const rightPicked = selected.includes(right.packageName) ? 0 : 1;
      return leftPicked - rightPicked;
    });
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

  const openIOSPicker = () =>
    run(async () => {
      if (!group) return;
      const count = await pickTargetsIOS(group.id);
      if (count > 0) await armTracking(group.id, group.time_zone);
    });

  const saveAndroid = () =>
    run(async () => {
      if (!group) return;
      const count = await saveSelectedPackages(group.id, selected);
      if (count > 0) await armTracking(group.id, group.time_zone);
    });

  const skip = async () => {
    await markProgress({ trackingSkipped: true });
    router.push('/ready');
  };

  const chosen = tracking.selectionCount > 0;

  return (
    <OnboardingStep
      step="tracking"
      eyebrow="추적 대상"
      title="어떤 앱을 세볼까요"
      description="고른 앱의 시간만 공동 풀에 들어가요. 그룹에는 개수만 보이고, 어떤 앱인지는 이 기기에만 남아요."
      footer={
        chosen ? (
          <Button label="다음" onPress={() => router.push('/ready')} />
        ) : (
          <>
            {Platform.OS === 'ios' ? (
              <Button label="앱 고르기" onPress={openIOSPicker} loading={busy} disabled={!group} />
            ) : (
              <Button
                label={selected.length > 0 ? `${selected.length}개 저장하기` : '앱을 골라 주세요'}
                onPress={saveAndroid}
                loading={busy}
                disabled={!group || selected.length === 0}
              />
            )}
            <Button label="나중에 하기" variant="plain" onPress={skip} />
          </>
        )
      }>
      {tracking.permission !== 'granted' && (
        <Card>
          <ThemedText type="small" themeColor="caution">
            사용량 권한이 아직 없어요
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            권한이 없으면 앱을 골라도 시간이 쌓이지 않아요.
          </ThemedText>
          <Button
            label="권한 화면으로"
            variant="quiet"
            onPress={() => router.push('/permission')}
          />
        </Card>
      )}

      {chosen && (
        <Card>
          <ThemedText type="metric">{tracking.selectionCount}개 고름</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            지금부터 이 앱들의 사용시간이 쌓여요. 바꾸면 다음 오전 6시부터 반영돼요.
          </ThemedText>
          {Platform.OS === 'ios' && (
            <Button label="다시 고르기" variant="quiet" onPress={openIOSPicker} />
          )}
        </Card>
      )}

      {Platform.OS === 'android' && !chosen && (
        <>
          <TextField
            label="앱 찾기"
            value={query}
            onChangeText={setQuery}
            placeholder="이름으로 검색"
            autoCorrect={false}
          />

          {apps === null ? (
            <ThemedText type="small" themeColor="textSecondary">
              설치된 앱을 읽고 있어요
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {visible.slice(0, VISIBLE_APP_LIMIT).map((app) => (
                <AppRow
                  key={app.packageName}
                  app={app}
                  checked={selected.includes(app.packageName)}
                  onToggle={() =>
                    setSelected((prev) =>
                      prev.includes(app.packageName)
                        ? prev.filter((name) => name !== app.packageName)
                        : [...prev, app.packageName]
                    )
                  }
                />
              ))}

              {visible.length > VISIBLE_APP_LIMIT && (
                <ThemedText type="small" themeColor="textSecondary">
                  {visible.length}개 중 {VISIBLE_APP_LIMIT}개만 보여요. 검색으로 좁혀 보세요.
                </ThemedText>
              )}
            </View>
          )}
        </>
      )}

      {error ? (
        <ThemedText type="small" themeColor="over">
          {error}
        </ThemedText>
      ) : null}
    </OnboardingStep>
  );
}

function AppRow({
  app,
  checked,
  onToggle,
}: {
  app: SelectableApp;
  checked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={app.label}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.appRow,
        {
          backgroundColor: checked ? theme.accentQuiet : theme.backgroundElement,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <ThemedText type="small" numberOfLines={1} style={styles.appLabel}>
        {app.label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={checked ? 'accent' : 'textSecondary'}>
        {checked ? '선택됨' : '선택'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.one,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
  },
  appLabel: {
    flexShrink: 1,
  },
});
