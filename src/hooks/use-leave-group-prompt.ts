import { router } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useLeaveGroup } from '@/hooks/use-groups';
import type { MyGroup } from '@/lib/groups';

/**
 * 그룹 나가기 확인 흐름.
 *
 * 무엇이 일어나는지를 누르기 **전에** 말한다. 세 경우가 서로 다른 일이라 문구도
 * 셋이다 — 지금 사라지는가, 내일 아침부터 빠지는가, 아니면 관리자라서 아직
 * 못 나가는가.
 *
 * 훅으로 뺀 이유는 들어오는 문이 둘이기 때문이다. 집계 중인 그룹은 상세 화면에서,
 * 시작 전 그룹은 대기실에서 나간다(시작 전 그룹은 상세 화면으로 갈 수 없다).
 * 두 곳에 같은 문구를 따로 적으면 한쪽만 고치게 된다.
 */
export function useLeaveGroupPrompt() {
  const leave = useLeaveGroup();

  const prompt = useCallback(
    (group: MyGroup, memberCount: number, isAdmin: boolean) => {
      const others = Math.max(0, memberCount - 1);
      // 서버 규칙과 같은 셈이다: 남는 사람이 2명 미만이면 그룹이 보관된다.
      const willArchive = others < 2;

      if (isAdmin && !willArchive) {
        Alert.alert(
          '먼저 관리자를 넘겨 주세요',
          '관리자가 나가면 남은 사람들이 그룹을 시작하거나 규칙을 바꿀 수 없어요. 다른 멤버에게 관리자를 넘긴 뒤에 나갈 수 있어요.',
          [{ text: '알겠어요' }]
        );
        return;
      }

      const body = willArchive
        ? `나가면 남는 사람이 ${others}명이라 이 그룹은 보관돼요. 목록에서 사라지고 다시 열 수 없어요.`
        : group.status === 'draft'
          ? '아직 시작하지 않은 그룹이라 바로 나가져요.'
          : '오늘의 공동 시간에는 이미 내 기록이 들어 있어서, 다음 오전 6시부터 빠져요.';

      Alert.alert(willArchive ? '그룹을 정리할까요?' : '그룹에서 나갈까요?', body, [
        { text: '취소', style: 'cancel' },
        {
          text: willArchive ? '정리하기' : '나가기',
          style: 'destructive',
          onPress: async () => {
            try {
              await leave.mutateAsync(group.id);
              router.replace('/');
            } catch (caught) {
              Alert.alert(
                '나가지 못했어요',
                caught instanceof Error ? caught.message : String(caught)
              );
            }
          },
        },
      ]);
    },
    [leave]
  );

  return { prompt, isPending: leave.isPending };
}
