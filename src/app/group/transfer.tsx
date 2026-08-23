import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, EmptyState, ScreenFrame, Surface } from '@/components/ui';
import { colors, radius as radii } from '@/constants/design-tokens';
import { useGroupMembers, useMyGroups, useTransferAdmin } from '@/hooks/use-groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useScreenGroup } from '@/hooks/use-screen-group';
import { avatarEmoji } from '@/lib/avatars';

/**
 * 관리자 넘기기.
 *
 * 나가려는 관리자를 서버가 막고(`admin_must_transfer`), 그 자리에서 여기로 온다.
 * 넘길 방법이 없으면 그 안내는 막다른 골목이다 — 관리자는 계정을 지우는 것
 * 말고는 그룹을 떠날 수 없었다.
 *
 * 목록을 화면으로 만든 이유는 `Alert`이 **Android에서 버튼 세 개까지만** 받기
 * 때문이다. 정원이 8명이라 후보가 최대 일곱이고, 넷째부터는 조용히 사라진다.
 *
 * 탈퇴를 예약한 사람은 후보에서 뺀다. 서버도 같은 것을 막지만(`target_leaving`),
 * 누를 수 있게 그려 놓고 눌린 뒤에 거절하는 것은 목록이 할 일이 아니다.
 */
export default function TransferAdminScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  const profile = useMyProfile();
  const groups = useMyGroups();
  const group = useScreenGroup(groups.data, groupId);
  const members = useGroupMembers(group?.id);
  const transfer = useTransferAdmin();

  const candidates = (members.data ?? []).filter(
    (member) => member.profile_id !== profile.data?.id && member.effective_until === null
  );

  const confirm = (memberId: string, name: string) =>
    Alert.alert(
      `${name}님에게 넘길까요?`,
      '넘기고 나면 그룹을 시작하거나 규칙을 바꾸는 일은 그 사람만 할 수 있어요. 되돌리려면 새 관리자가 다시 넘겨 줘야 해요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '넘기기',
          onPress: async () => {
            if (!group) return;
            try {
              await transfer.mutateAsync({ groupId: group.id, newAdminId: memberId });
              router.back();
            } catch (caught) {
              Alert.alert(
                '넘기지 못했어요',
                caught instanceof Error ? caught.message : String(caught)
              );
            }
          },
        },
      ]
    );

  return (
    <ScreenFrame bottomInset={24}>
      <View style={styles.navBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.circle}>
          <AppText variant="bodyStrong" tone="body">
            ←
          </AppText>
        </Pressable>
        <AppText variant="sectionTitle">관리자 넘기기</AppText>
      </View>

      <AppText variant="body" tone="muted">
        {group?.name ?? '이 그룹'}의 관리자를 누구에게 넘길까요?
      </AppText>

      {candidates.length === 0 ? (
        <EmptyState
          title="넘길 사람이 없어요"
          body="함께 남아 있는 멤버가 있어야 관리자를 넘길 수 있어요."
        />
      ) : (
        <View style={styles.rows}>
          {candidates.map((member) => (
            <Pressable
              key={member.profile_id}
              accessibilityRole="button"
              disabled={transfer.isPending}
              onPress={() => confirm(member.profile_id, member.nickname)}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <Surface
                fill={colors.surface.row}
                border={colors.border.subtle}
                cornerRadius={24}
                padding={16}
                style={styles.row}>
                <Avatar
                  id={member.profile_id}
                  name={member.nickname}
                  emoji={avatarEmoji(member.avatar_key)}
                  size={44}
                />
                <AppText variant="bodyStrong" style={styles.name}>
                  {member.nickname}
                </AppText>
                <AppText variant="metadata" tone="muted">
                  넘기기
                </AppText>
              </Surface>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glass,
    borderWidth: 1,
    borderColor: colors.border.hairlineStrong,
  },
  rows: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radii.listRow },
  name: { flex: 1 },
  pressed: { opacity: 0.7 },
});
