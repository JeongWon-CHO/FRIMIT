import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_TIME_ZONE, frimitDateKey, periodStartFor } from '@/lib/frimit-day';
import {
  ScreenTime,
  type PermissionState,
  type SelectableApp,
  type SelectionSummary,
  type UsageSnapshot,
} from '@modules/screen-time';

/**
 * 기술 스파이크 화면.
 *
 * plan.md 5장 1단계 — "실제 기기에서 권한 요청, 앱 선택, 그룹별 누적 합계 추출,
 * 로컬 저장을 검증한다" — 를 눈으로 확인하기 위한 화면이다. 제품 UI가 아니라
 * 계측 장비에 가깝게 만들었다. 여기서 나온 숫자가 이후 설계의 근거가 된다.
 */

/** 스파이크에서는 그룹 하나만 다룬다. 여러 그룹 동시 집계는 이게 된 다음 문제다. */
const SPIKE_GROUP_ID = 'spike-group-1';

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${rest}초`;
  if (minutes > 0) return `${minutes}분 ${rest}초`;
  return `${rest}초`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '없음';
  const date = new Date(iso);
  return date.toLocaleString('ko-KR', { timeZone: DEFAULT_TIME_ZONE, hour12: false });
}

export default function SpikeScreen() {
  const theme = useTheme();

  const [permission, setPermission] = useState<PermissionState>('notDetermined');
  const [selection, setSelection] = useState<SelectionSummary | null>(null);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [androidApps, setAndroidApps] = useState<SelectableApp[] | null>(null);
  const [androidSelected, setAndroidSelected] = useState<string[]>([]);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const append = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    setLog((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 30));
  }, []);

  /** 권한은 시스템 설정에서 언제든 꺼질 수 있으므로 앱이 앞으로 나올 때마다 다시 읽는다. */
  const refresh = useCallback(async () => {
    try {
      setPermission(ScreenTime.getPermissionState());
      setSelection(ScreenTime.getSelectionSummary(SPIKE_GROUP_ID));
      setSnapshot(await ScreenTime.getSnapshot(SPIKE_GROUP_ID));
    } catch (error) {
      append(`갱신 실패: ${String(error)}`);
    }
  }, [append]);

  useEffect(() => {
    refresh();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    // 권한 상태는 앱 시작 직후 늦게 실린다. 한 번 읽고 끝내면 이미 승인된 사용자에게
    // "권한 없음"으로 보이므로, 네이티브의 변화를 구독해 따라간다.
    const permissionChange = ScreenTime.addPermissionChangeListener(({ permissionState }) => {
      setPermission(permissionState);
      append(`권한 변화 감지: ${permissionState}`);
    });

    return () => {
      appState.remove();
      permissionChange.remove();
    };
  }, [refresh, append]);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
        append(`${label} ✓`);
      } catch (error) {
        append(`${label} ✗ ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [append, refresh]
  );

  const onRequestPermission = () =>
    run('권한 요청', async () => {
      const state = await ScreenTime.requestPermission();
      append(`권한 상태: ${state}`);
    });

  const onSelectApps = () =>
    run('앱 선택', async () => {
      if (Platform.OS === 'ios') {
        const result = await ScreenTime.presentSelection(SPIKE_GROUP_ID);
        append(`선택 개수: ${result.selectionCount}`);
      } else {
        const apps = await ScreenTime.getSelectableApps();
        setAndroidApps(apps);
        append(`설치 앱 ${apps.length}개 조회`);
      }
    });

  /** Android는 시스템 picker가 없으므로 목록에서 눌러 켜고 끈다. */
  const onToggleAndroidApp = (app: SelectableApp) =>
    run(`${app.label} 토글`, async () => {
      const next = androidSelected.includes(app.packageName)
        ? androidSelected.filter((name) => name !== app.packageName)
        : [...androidSelected, app.packageName];
      setAndroidSelected(next);
      ScreenTime.setSelection(SPIKE_GROUP_ID, next);
    });

  const onStartTracking = () =>
    run('집계 시작', async () => {
      const periodStart = periodStartFor(new Date(), DEFAULT_TIME_ZONE);
      await ScreenTime.startTracking(SPIKE_GROUP_ID, periodStart, DEFAULT_TIME_ZONE);
      setTracking(true);
      append(`구간 시작: ${periodStart.toISOString()}`);
    });

  const onStopTracking = () =>
    run('집계 중지', async () => {
      await ScreenTime.stopTracking(SPIKE_GROUP_ID);
      setTracking(false);
    });

  const onDiagnostics = () =>
    run('진단', async () => {
      if (Platform.OS !== 'ios') {
        append('진단은 iOS 전용입니다');
        return;
      }
      const info = ScreenTime.getDiagnostics();
      append(`App Group: ${info.appGroupConfigured ? info.appGroupIdentifier : '연결 안 됨'}`);
      append(`감시 중 ${info.activeMonitorCount}개 / 임계값 ${info.thresholdEventCount}개`);

      // 계단값이 멈춘 것인지, 화면이 안 읽은 것인지를 구분하려면
      // extension이 마지막으로 기록한 시각까지 봐야 한다.
      const detail = ScreenTime.getUsageDetail(SPIKE_GROUP_ID);
      append(
        `계단값 ${detail.thresholdSeconds}초 · 마지막 기록 ${
          detail.lastUpdatedAt
            ? new Date(detail.lastUpdatedAt).toLocaleTimeString('ko-KR', { hour12: false })
            : '없음'
        }`
      );
    });

  const permissionTone =
    permission === 'granted' ? '#2e9e5b' : permission === 'notDetermined' ? '#c08a2e' : '#d0483c';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Frimit 스파이크</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS} · Frimit 일자 {frimitDateKey(new Date(), DEFAULT_TIME_ZONE)}
          </ThemedText>

          <Section title="상태">
            <Row label="수집 지원" value={ScreenTime.isSupported ? '가능' : '불가'} />
            <Row label="권한" value={permission} tone={permissionTone} />
            <Row label="선택한 대상" value={`${selection?.selectionCount ?? 0}개`} />
            <Row label="선택 변경" value={formatTime(selection?.updatedAt ? new Date(selection.updatedAt).toISOString() : null)} />
          </Section>

          <Section title="누적 사용량">
            {snapshot ? (
              <>
                <Row label="누적" value={formatSeconds(snapshot.cumulativeSeconds)} />
                <Row label="구간 시작" value={formatTime(snapshot.periodStart)} />
                <Row label="마지막 수집" value={formatTime(snapshot.collectedAt)} />
                <Row label="출처" value={snapshot.source} />
                <Row label="순번" value={String(snapshot.sequence)} />
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                아직 집계를 시작하지 않았습니다.
              </ThemedText>
            )}
          </Section>

          <Section title="동작">
            <Action label="1. 권한 요청" onPress={onRequestPermission} disabled={busy} />
            <Action
              label={Platform.OS === 'ios' ? '2. 앱 선택 (시스템 picker)' : '2. 설치 앱 조회'}
              onPress={onSelectApps}
              disabled={busy || permission !== 'granted'}
            />
            <Action
              label="3. 집계 시작"
              onPress={onStartTracking}
              disabled={busy || !selection?.selectionCount}
            />
            <Action label="4. 새로고침" onPress={() => run('새로고침', refresh)} disabled={busy} />
            <Action label="집계 중지" onPress={onStopTracking} disabled={busy || !tracking} />
            {Platform.OS === 'ios' && (
              <Action label="진단 정보" onPress={onDiagnostics} disabled={busy} />
            )}
          </Section>

          {androidApps && (
            <Section title={`설치 앱 (${androidApps.length})`}>
              {androidApps.slice(0, 30).map((app) => (
                <Action
                  key={app.packageName}
                  label={`${androidSelected.includes(app.packageName) ? '✓ ' : ''}${app.label}`}
                  onPress={() => onToggleAndroidApp(app)}
                  disabled={busy}
                />
              ))}
            </Section>
          )}

          <Section title="기록">
            {log.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                아직 없음
              </ThemedText>
            ) : (
              log.map((line, index) => (
                <ThemedText key={index} type="code" themeColor="textSecondary">
                  {line}
                </ThemedText>
              ))
            )}
          </Section>

          {busy && <ActivityIndicator color={theme.text} />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={tone ? { color: tone } : undefined}>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

function Action({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.backgroundSelected, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  action: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
