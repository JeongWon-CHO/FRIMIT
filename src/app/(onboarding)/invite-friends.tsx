import { router, useLocalSearchParams } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { InviteCodeCard, OnboardingFrame } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { useGroupMembers, useMyGroups } from '@/hooks/use-groups';
import { avatarEmoji } from '@/lib/avatars';
import { formatShort } from '@/lib/format';

/**
 * 10 · 친구 부르기.
 *
 * 코드를 건네고 좌석이 차는 것을 지켜보는 화면이다.
 *
 * ⚠️ 스펙은 "친구가 들어오면 수동 새로고침 없이 좌석이 채워져야 한다"고 요구하는데,
 * 실시간 퍼블리케이션에는 `daily_member_usage`만 들어 있다. `groups`·
 * `group_memberships` 구독이 없으면 그 애니메이션은 성립하지 않는다. 지금은
 * 화면에 들어올 때마다 다시 읽는 것으로 대신한다 — 마이그레이션 한 줄이면 풀린다.
 */
const ORBIT = 250;

export default function InviteFriendsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const groups = useMyGroups();
  const group = groups.data?.find((candidate) => candidate.id === groupId) ?? groups.data?.[0];
  const members = useGroupMembers(group?.id);

  const joined = members.data?.length ?? 1;
  const expected = Math.max(4, joined);

  const share = async () => {
    if (!group) return;
    await Share.share({
      message: `${group.name}에 초대할게요. Frimit에서 코드 ${group.invite_code}로 참여해 주세요.`,
    });
  };

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 400, opacity: 0.32, x: 169, y: 200 }}
      footer={
        <ButtonStack>
          <GradientButton label="Share invite" onPress={share} />
          <GradientButton
            label="다음"
            variant="secondary"
            onPress={() => router.push('/tracking')}
          />
        </ButtonStack>
      }>
      <View style={styles.top}>
        <AppText variant="screenTitle" style={styles.title}>
          친구를 불러요
        </AppText>
        <AppText variant="body" tone="muted">
          한 명만 들어와도 공동 시간이 시작돼요.
        </AppText>
      </View>

      <View style={styles.orbitBox}>
        <SharedOrbitRing
          size={ORBIT}
          progress={joined / expected}
          gradient={gradients.sharedPool.colors}
          showTrackDashes
          strokeRatio={0.13}>
          <AppText variant="heroNumberMd">
            {group ? formatShort(28800) : '—'}
          </AppText>
          <AppText variant="metadata" tone="metadata">
            {joined} of {expected} joined
          </AppText>
        </SharedOrbitRing>

        <OrbitSeats
          seats={Array.from({ length: expected }, (_, index) => {
            const member = members.data?.[index];
            return member
              ? {
                  id: member.profile_id,
                  name: member.nickname,
                  emoji: avatarEmoji(member.avatar_key),
                  ring: index === 0 ? ('activity' as const) : ('none' as const),
                }
              : { id: `seat-${index}`, name: '+', pending: true };
          })}
          size={ORBIT}
          placement="outer"
          seatSize={34}
        />
      </View>

      {group && <InviteCodeCard code={group.invite_code} />}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  top: { gap: 8 },
  title: { fontSize: 30, lineHeight: 38 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
});
