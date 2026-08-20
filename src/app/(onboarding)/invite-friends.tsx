import { router, useLocalSearchParams } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';

import { OrbitSeats, SharedOrbitRing } from '@/components/orbit';
import { BackButton, InviteCodeCard, OnboardingFrame } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { useGroupMembers, useMyGroups } from '@/hooks/use-groups';
import { useScreenGroup } from '@/hooks/use-screen-group';
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
  const group = useScreenGroup(groups.data, groupId);
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
          <GradientButton label="초대 보내기" onPress={share} />
          <GradientButton
            label="다음"
            variant="secondary"
            onPress={() => router.push('/tracking')}
          />
        </ButtonStack>
      }>
      <View style={styles.top}>
        {/*
          여기서 뒤는 만들기 화면이 아니라 오늘 화면이다. 그룹은 이미 만들어졌고,
          앞 화면으로 돌려보내면 두 번째 그룹을 만들게 된다. 만든 그룹은 오늘
          화면에 '시작 대기' 카드로 서 있으니 언제든 다시 들어올 수 있다.
        */}
        <View style={styles.navRow}>
          <BackButton onPress={() => router.replace('/')} />
          <View style={styles.navSpacer} />
        </View>

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
            {expected}명 중 {joined}명 참여
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
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  navSpacer: { width: 38 },
  title: { fontSize: 30, lineHeight: 38 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
});
