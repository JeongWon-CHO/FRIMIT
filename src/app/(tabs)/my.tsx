import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  GradientButton,
  ScreenFrame,
  StatusDot,
  Surface,
} from '@/components/ui';
import { colors, radius as radii } from '@/constants/design-tokens';
import { useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useTrackingState } from '@/hooks/use-tracking';
import { hexToRgba } from '@/lib/color';
import { formatShort } from '@/lib/format';
import { resetProgress } from '@/lib/onboarding';
import { groupAccent } from '@/lib/today';
import { describePermission, isUsable, requestPermission } from '@/lib/tracking';

/**
 * MY 탭.
 *
 * 디자인의 스탯 두 칸은 "주간 평균"과 "한도 미만 연속 일수"인데 **둘 다 조회
 * 경로가 없다** — `daily_member_usage`에 90일치가 남지만 그걸 읽는 RPC가 없다.
 * 없는 값을 '—'로 채워 두는 것보다, 이미 있는 값 둘로 같은 자리를 채운다:
 * 참여 중인 그룹 수와 오늘 내 사용 시간.
 *
 * 권한 줄은 오늘 화면의 권한 꺼짐 상태와 **같은 CTA**를 쓴다. 두 번 만들지 않는다.
 */
export default function MyScreen() {
  const profile = useMyProfile();
  const groups = useMyGroups();
  const usages = useGroupUsages(groups.data);
  const tracking = useTrackingState(groups.data?.[0]?.id);

  const granted = isUsable(tracking.permission);

  const myToday = (groups.data ?? []).reduce((sum, group) => {
    const usage = usages.byGroupId.get(group.id);
    const mine = usage?.members.find((member) => member.profile_id === profile.data?.id);
    return sum + (mine?.cumulative_seconds ?? 0);
  }, 0);

  return (
    <ScreenFrame
      ambient={{ color: colors.accent.violetSoft, size: 380, opacity: 0.24, x: 195, y: 60 }}>
      <View style={styles.profile}>
        <Avatar
          id={profile.data?.id ?? 'me'}
          name={profile.data?.nickname}
          emoji={undefined}
          size="xl"
          ring="activity"
        />
        <AppText variant="greeting">{profile.data?.nickname ?? '…'}</AppText>
        <AppText variant="metadata" tone="faint" font="mono">
          {groups.data?.length ?? 0} groups
        </AppText>
      </View>

      <View style={styles.statGrid}>
        <StatCard value={String(groups.data?.length ?? 0)} caption="참여 중인 그룹" />
        <StatCard value={formatShort(myToday)} caption="오늘 내 사용" />
      </View>

      {!granted && (
        <Surface
          fill={colors.surface.cardNeutral}
          cornerRadius={22}
          padding={16}
          style={styles.permission}>
          <AppText variant="bodyStrong" tone="body">
            {describePermission(tracking.permission)}
          </AppText>
          <AppText variant="metadata" tone="metadata">
            권한을 켜면 내 사용 시간이 우리 공동 시간에 합산돼요.
          </AppText>
          <GradientButton
            label="Screen Time 권한 켜기"
            size="md"
            onPress={() => requestPermission().finally(tracking.refresh)}
          />
        </Surface>
      )}

      <AppText variant="eyebrow" tone="faint" style={styles.sectionTitle}>
        MY GROUPS
      </AppText>

      <View style={styles.rows}>
        {(groups.data ?? []).map((group) => {
          const usage = usages.byGroupId.get(group.id);
          const accent = colors.groupAccent[groupAccent(group)];

          return (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              onPress={() =>
                group.status === 'draft'
                  ? router.push({ pathname: '/ready', params: { groupId: group.id } })
                  : router.push({ pathname: '/group/[id]', params: { id: group.id } })
              }
              style={styles.row}>
              <StatusDot color={accent.dot} size={10} />
              <AppText variant="bodyStrong" style={styles.rowName}>
                {group.name}
              </AppText>
              <AppText variant="metadata" tone="muted" font="mono">
                {usage
                  ? `${formatShort(usage.daily_limit_seconds)} · ${usage.member_count}`
                  : '시작 대기'}
              </AppText>
            </Pressable>
          );
        })}

        {(groups.data?.length ?? 0) === 0 && (
          <GradientButton label="그룹 만들기" size="md" onPress={() => router.push('/group')} />
        )}
      </View>

      <View style={styles.rows}>
        <SettingRow
          label="추적 대상"
          value={`${tracking.selectionCount}개 선택`}
          onPress={() => router.push('/tracking')}
        />
        <SettingRow
          label="닉네임 · 아바타"
          value={profile.data?.nickname ?? '…'}
          onPress={() => router.push('/nickname')}
        />
      </View>

      {__DEV__ && (
        <View style={styles.rows}>
          <SettingRow label="스파이크 화면" value="개발용" onPress={() => router.push('/spike')} />
          <SettingRow label="갤러리" value="개발용" onPress={() => router.push('/gallery')} />
          <SettingRow label="오빗 실험대" value="개발용" onPress={() => router.push('/orbit-demo')} />
          <SettingRow
            label="온보딩 다시 보기"
            value="개발용"
            onPress={async () => {
              await resetProgress();
              router.replace('/welcome');
            }}
          />
        </View>
      )}
    </ScreenFrame>
  );
}

/**
 * 숫자 한 칸.
 *
 * 값이 26px, 설명이 12px이다. 이 화면에서 가장 큰 글자가 내 숫자여도 되는 이유는
 * 여기가 공동 풀을 보여주는 자리가 아니기 때문이다.
 */
function StatCard({ value, caption }: { value: string; caption: string }) {
  return (
    <Surface
      fill={colors.surface.elevated}
      cornerRadius={radii.memberCard}
      padding={16}
      style={styles.statCard}>
      <View style={styles.statBottom}>
        <AppText variant="cardNumber" style={styles.statValue}>
          {value}
        </AppText>
        <AppText variant="metadata" tone="muted">
          {caption}
        </AppText>
      </View>
    </Surface>
  );
}

function SettingRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingRow}>
      <AppText variant="bodyStrong">{label}</AppText>
      <AppText variant="metadata" tone="muted">
        {value}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 12, paddingTop: 8 },
  statGrid: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, height: 104, justifyContent: 'flex-end' },
  statBottom: { gap: 2 },
  statValue: { fontSize: 26, lineHeight: 30 },
  permission: { gap: 10 },
  sectionTitle: { paddingHorizontal: 6, paddingTop: 4 },
  rows: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: radii.listRow,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface.row,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  rowName: { flex: 1 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: radii.listRow,
    paddingVertical: 13,
    paddingHorizontal: 16,
    backgroundColor: hexToRgba('#FFFFFF', 0.03),
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
});
