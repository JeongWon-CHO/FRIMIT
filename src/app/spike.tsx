import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_TIME_ZONE,
  frimitDateKey,
  nextPeriodStartFor,
  periodStartFor,
} from '@/lib/frimit-day';
import { ensureGroup, setReady, startGroup, type MyGroup } from '@/lib/groups';
import { signInAnonymouslyForDev } from '@/lib/supabase';
import { describeSyncSummary } from '@/lib/usage-payload';
import { syncUsage } from '@/lib/usage-sync';
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
 *
 * 네이티브가 그룹별로 사용량을 나눠 재는 키는 **서버 그룹의 UUID 그대로**다.
 * 예전에는 로컬 문자열('spike-group-1')을 썼는데, 기기 안에서는 멀쩡해 보이다가
 * 업로드 단계에서 전부 거절된다. 그래서 화면이 뜨면 먼저 그룹부터 확보한다.
 */

/** 스파이크에서는 그룹 하나만 다룬다. 여러 그룹 동시 집계는 이게 된 다음 문제다. */
const SPIKE_GROUP_NAME = '스파이크';

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
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [group, setGroup] = useState<MyGroup | null>(null);

  /** 동기화가 겹치지 않게 막는 빗장. */
  const syncingRef = useRef(false);
  /**
   * 리스너가 보는 최신 콜백.
   *
   * 콜백을 리스너에 직접 넘기면 group이 정해질 때마다 구독을 떼었다 다시 걸게
   * 되고, 그 과정에서 동기화가 한 번 더 돈다. 리스너는 한 번만 걸고 내용만 바꾼다.
   */
  const handlersRef = useRef({ refresh: async () => {}, syncToServer: async () => {} });

  const append = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    setLog((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 30));
  }, []);

  /** 권한은 시스템 설정에서 언제든 꺼질 수 있으므로 앱이 앞으로 나올 때마다 다시 읽는다. */
  const refresh = useCallback(async () => {
    if (!group) return;
    try {
      setPermission(ScreenTime.getPermissionState());
      setSelection(ScreenTime.getSelectionSummary(group.id));
      setSnapshot(await ScreenTime.getSnapshot(group.id));
    } catch (error) {
      append(`갱신 실패: ${String(error)}`);
    }
  }, [append, group]);

  /**
   * 서버 그룹을 확보한다. 이게 되기 전에는 어떤 동작도 의미가 없으므로
   * (네이티브의 groupId가 곧 이 UUID다) 화면이 뜨자마자 한 번 시도한다.
   */
  const ensureServerGroup = useCallback(async () => {
    try {
      await signInAnonymouslyForDev();
      const mine = await ensureGroup(SPIKE_GROUP_NAME);
      setGroup(mine);
      append(`그룹 확보: ${mine.name} (${mine.status}) · 초대 코드 ${mine.invite_code}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      append(`그룹 확보 실패: ${reason}`);
    }
  }, [append]);

  /**
   * 서버로 올린다. iOS는 계단값이라 백그라운드에서 정확해질 수 없으므로,
   * 앱이 앞으로 나올 때가 사실상 유일하게 믿을 만한 동기화 시점이다(plan.md 184행).
   *
   * 실패해도 화면을 막지 않는다. 보관된 그룹이나 아직 반영되지 않은 가입처럼
   * 고칠 것이 없는 거절이 대부분이고, 그 사유는 기록에 남는다.
   */
  const syncToServer = useCallback(async () => {
    // 화면 진입과 AppState 변화가 거의 동시에 걸린다. 서버가 멱등이라 값이
    // 틀어지지는 않지만 왕복이 그냥 낭비된다.
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const summary = await syncUsage();
      const line = describeSyncSummary(summary);
      setLastSync(line);
      append(`서버 동기화: ${line}`);

      // 구간이 넘어갔으면 화면이 들고 있는 스냅샷은 이미 지난 구간의 것이다.
      if (summary.rolled.length > 0) await refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setLastSync(`실패: ${reason}`);
      append(`서버 동기화 실패: ${reason}`);
    } finally {
      syncingRef.current = false;
    }
  }, [append, refresh]);

  // 그룹 확보는 앱을 켤 때 한 번이면 된다.
  useEffect(() => {
    ensureServerGroup();
  }, [ensureServerGroup]);

  useEffect(() => {
    handlersRef.current = { refresh, syncToServer };
  }, [refresh, syncToServer]);

  // 구독은 화면 수명 동안 한 번이면 된다.
  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      handlersRef.current.refresh();
      handlersRef.current.syncToServer();
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
  }, [append]);

  // 그룹이 정해진 뒤에 한 번 읽고 올린다. 그 전에는 올려 봐야 올릴 그룹이 없다.
  useEffect(() => {
    if (!group) return;
    refresh();
    syncToServer();
  }, [group, refresh, syncToServer]);

  /** 그룹이 없으면 어떤 동작도 서버와 이어지지 않는다. 조용히 넘어가지 않고 막는다. */
  const requireGroup = useCallback((): string => {
    if (!group) throw new Error('그룹이 아직 준비되지 않았습니다.');
    return group.id;
  }, [group]);

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
        const result = await ScreenTime.presentSelection(requireGroup());
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
      ScreenTime.setSelection(requireGroup(), next);
    });

  const onStartTracking = () =>
    run('집계 시작', async () => {
      const now = new Date();
      const periodStart = periodStartFor(now, DEFAULT_TIME_ZONE);
      await ScreenTime.startTracking(
        requireGroup(),
        periodStart,
        nextPeriodStartFor(now, DEFAULT_TIME_ZONE),
        DEFAULT_TIME_ZONE
      );
      setTracking(true);
      append(`구간 시작: ${periodStart.toISOString()}`);
    });

  const onStopTracking = () =>
    run('집계 중지', async () => {
      await ScreenTime.stopTracking(requireGroup());
      setTracking(false);
    });

  const onReady = () =>
    run('준비 완료', async () => {
      await setReady(requireGroup(), true);
      append('준비 상태를 켰습니다. 시작하려면 준비된 멤버가 2명 이상이어야 합니다');
    });

  /**
   * 그룹을 시작해야 사용량이 집계된다. 준비된 멤버가 2명 이상이어야 하므로
   * 혼자서는 여기서 막힌다 — 초대 코드를 다른 기기나 `scripts/join-test-member.sh`에
   * 넘겨 한 명을 더 채운 뒤 다시 누른다.
   */
  const onStartGroup = () =>
    run('그룹 시작', async () => {
      const snapshotAfter = await startGroup(requireGroup());
      setGroup((prev) => (prev ? { ...prev, status: snapshotAfter.group.status } : prev));
      append(`그룹 상태: ${snapshotAfter.group.status} · 활성 멤버 ${snapshotAfter.active_member_count}명`);
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
      const detail = ScreenTime.getUsageDetail(requireGroup());
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

          <Section title="그룹">
            <Row label="이름" value={group?.name ?? '확보 중…'} />
            <Row label="상태" value={group?.status ?? '-'} />
            <Row label="초대 코드" value={group?.invite_code ?? '-'} />
            <Row label="집계 여부" value={group?.status === 'active' ? '집계 중' : '시작 전(집계 안 함)'} />
          </Section>

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
                <Row label="서버 동기화" value={lastSync ?? '아직 없음'} />
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
            <Action label="4. 준비 완료" onPress={onReady} disabled={busy || !group} />
            <Action
              label="5. 그룹 시작 (준비 2명 필요)"
              onPress={onStartGroup}
              disabled={busy || group?.status !== 'draft'}
            />
            <Action label="6. 새로고침" onPress={() => run('새로고침', refresh)} disabled={busy} />
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
