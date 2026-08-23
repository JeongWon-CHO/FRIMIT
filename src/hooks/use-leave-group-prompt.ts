import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useLeaveGroup } from '@/hooks/use-groups';
import { queryKeys } from '@/lib/query';
import type { GroupMember, MyGroup } from '@/lib/groups';

/**
 * 그룹을 접는 확인 흐름.
 *
 * 한 RPC(`leave_group`)가 상황에 따라 전혀 다른 일을 한다. 그래서 묻는 문장도
 * 갈라진다 — 지금 사라지는가, 내일 아침부터 빠지는가, 남는 친구의 그룹까지
 * 함께 사라지는가.
 *
 * **남는 사람이 2명 미만이면 서버가 그룹을 그 자리에서 접는다.** 목록에서
 * 사라지고, 초대 코드가 풀리고, 그룹 5개 상한에서도 빠진다. 되돌리는 경로는
 * 없다. 사용자 쪽에서 보면 그게 삭제이므로 문구도 '삭제'로 쓴다 — '보관'은
 * 데이터베이스 사정이지 사용자가 알아야 할 말이 아니다.
 *
 * 시작 전 그룹은 사용량 행이 애초에 생기지 않는다(서버가 `group_not_collecting`
 * 으로 막는다). 지울 때 무너질 기록이 없다는 뜻이고, 그래서 시작 전 그룹을
 * 접는 것은 언제나 안전하다.
 *
 * 훅으로 뺀 이유는 들어오는 문이 둘이기 때문이다. 집계 중인 그룹은 상세 화면에서,
 * 시작 전 그룹은 대기실에서 접는다(시작 전 그룹은 상세 화면으로 갈 수 없다).
 */
export function useLeaveGroupPrompt() {
  const leave = useLeaveGroup();
  const queryClient = useQueryClient();

  const prompt = useCallback(
    (group: MyGroup, members: GroupMember[] | undefined, myProfileId: string | undefined) => {
      const others = (members ?? []).filter((member) => member.profile_id !== myProfileId);
      // 서버 규칙과 같은 셈이다: 남는 사람이 2명 미만이면 그룹이 접힌다.
      const willVanish = others.length < 2;
      const isAdmin = group.admin_id === myProfileId;

      /*
       * 관리자는 살아남을 그룹을 두고 나갈 수 없다(서버의 `admin_must_transfer`).
       * 안내만 하고 끝내면 막다른 골목이다 — 넘길 화면으로 가는 문을 여기 붙인다.
       * 들어오는 문이 둘(상세 화면·대기실)이라 문도 이 한 곳에 있으면 된다.
       */
      if (isAdmin && !willVanish) {
        Alert.alert(
          '먼저 관리자를 넘겨 주세요',
          '관리자가 나가면 남은 사람들이 그룹을 시작하거나 규칙을 바꿀 수 없어요. 다른 멤버에게 관리자를 넘긴 뒤에 나갈 수 있어요.',
          [
            { text: '나중에', style: 'cancel' },
            {
              text: '넘기기',
              onPress: () =>
                router.push({ pathname: '/group/transfer', params: { groupId: group.id } }),
            },
          ]
        );
        return;
      }

      const { title, body, action } = describe(group, others);

      Alert.alert(title, body, [
        { text: '취소', style: 'cancel' },
        {
          text: action,
          style: 'destructive',
          onPress: async () => {
            try {
              await leave.mutateAsync(group.id);

              /*
                순서가 눈에 보인다.

                `replace`는 스택의 맨 위 한 장만 바꾸므로 오늘 화면이 하나 더
                쌓인다. `dismissTo`는 이미 있는 오늘 화면이 나올 때까지 걷어내서
                상세 화면이든 온보딩 사슬이든 통째로 정리한다.

                캐시는 그 **뒤에** 비운다. 먼저 비우면 지금 화면이 자기 그룹을
                잃고 빈 상태로 한 번 다시 그려진다 — 떠나는 길에 낯선 화면이
                번쩍이는 것이 그것이다.
              */
              router.dismissTo('/');
              queryClient.invalidateQueries({ queryKey: queryKeys.allGroups });
            } catch (caught) {
              Alert.alert(
                '접지 못했어요',
                caught instanceof Error ? caught.message : String(caught)
              );
            }
          },
        },
      ]);
    },
    [leave, queryClient]
  );

  return { prompt, isPending: leave.isPending };
}

/** 남는 사람 수와 그룹 상태에 따라 실제로 벌어지는 일을 그대로 쓴다. */
function describe(group: MyGroup, others: GroupMember[]) {
  if (others.length === 0) {
    return {
      title: '이 그룹을 삭제할까요?',
      body:
        group.status === 'draft'
          ? '아직 시작하지 않았고 혼자 있는 그룹이라 지금 바로 사라져요. 되돌릴 수 없어요.'
          : '혼자 있는 그룹이라 지금 바로 사라져요. 지금까지의 기록도 함께 볼 수 없게 되고, 되돌릴 수 없어요.',
      action: '삭제',
    };
  }

  if (others.length === 1) {
    return {
      title: '이 그룹을 삭제할까요?',
      // 나 하나 나가는 것이 아니라 남는 사람의 그룹까지 없어진다. 그건 반드시
      // 이름을 불러 줘야 하는 종류의 결과다.
      body: `나가면 ${others[0].nickname}님 혼자 남아서 공동 시간이 성립하지 않아요. 두 사람 모두에게서 그룹이 사라지고, 되돌릴 수 없어요.`,
      action: '삭제',
    };
  }

  return {
    title: '그룹에서 나갈까요?',
    body:
      group.status === 'draft'
        ? '아직 시작하지 않은 그룹이라 바로 나가져요. 남은 사람들의 그룹은 그대로예요.'
        : '오늘의 공동 시간에는 이미 내 기록이 들어 있어서, 다음 오전 6시부터 빠져요.',
    action: '나가기',
  };
}
