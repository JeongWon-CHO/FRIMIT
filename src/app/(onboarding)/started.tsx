import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { OnboardingFrame } from '@/components/onboarding';
import { AppText, GradientButton } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { useGroupMembers, useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { avatarEmoji } from '@/lib/avatars';
import { formatShort } from '@/lib/format';
import { markProgress } from '@/lib/onboarding';

/**
 * 15 · 시작했어요.
 *
 * 절제된 축하이자 제품으로 넘어가는 문이다. 색종이도 소리도 없다. 자동으로
 * 넘어가지도 않는다 — 여기서는 사용자가 직접 누른다.
 *
 * 이 앱에서 가장 큰 블룸이 여기 있고, 화면 폭을 넘는 유일한 빛이다.
 */
const ORBIT = 300;

export default function GroupStartedScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const groups = useMyGroups();
  const group = groups.data?.find((candidate) => candidate.id === groupId) ?? groups.data?.[0];
  const members = useGroupMembers(group?.id);
  const usages = useGroupUsages(group ? [group] : []);
  const usage = group ? usages.byGroupId.get(group.id) : undefined;

  const limit = usage?.daily_limit_seconds ?? 28800;

  const finish = async () => {
    await markProgress({ done: true });
    // reset이 아니라 replace다. 온보딩 스택은 이 화면이 마지막이라 뒤로 가도
    // 돌아올 곳이 없다.
    router.replace('/');
  };

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 560, opacity: 0.5, x: 169, y: 330 }}
      footer={<GradientButton label="See today" onPress={finish} />}>
      <AppText variant="numericLabel" tone="faint" style={styles.eyebrow}>
        POOL ACTIVE
      </AppText>

      <View style={styles.orbitBox}>
        <SharedOrbitRing
          size={ORBIT}
          progress={usage ? Math.min(1, usage.total_seconds / limit) : 0.02}
          gradient={gradients.sharedPool.colors}
          strokeRatio={0.12}
          glow="strong">
          <AppText variant="heroNumber" style={styles.number}>
            {formatShort(usage?.remaining_seconds ?? limit)}
          </AppText>
          <AppText variant="bodyStrong" tone="metadata">
            shared today
          </AppText>
        </SharedOrbitRing>

        <OrbitSeats
          seats={(members.data ?? []).map((member) => ({
            id: member.profile_id,
            name: member.nickname,
            emoji: avatarEmoji(member.avatar_key),
            ring: 'activity' as const,
          }))}
          size={ORBIT}
          placement="outer"
          seatSize={40}
        />
      </View>

      <View style={styles.copy}>
        <AppText variant="screenTitle" font="display" style={styles.headline}>
          Our time starts now.
        </AppText>
        <AppText variant="body" tone="muted">
          {members.data?.length ?? 2}명이 하나의 시간을 공유해요.
        </AppText>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  eyebrow: { alignSelf: 'center' },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  number: { fontSize: 52, lineHeight: 56, letterSpacing: -2.6 },
  copy: { gap: 8 },
  headline: { fontSize: 32, lineHeight: 38, letterSpacing: -1.1 },
});
