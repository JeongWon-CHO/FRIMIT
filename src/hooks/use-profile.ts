import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query';
import { fetchMyProfile, updateMyProfile } from '@/lib/profile';

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: fetchMyProfile,
    // 닉네임과 아바타는 사용자가 바꿀 때만 바뀐다. 화면을 옮길 때마다 다시 읽을 이유가 없다.
    staleTime: 5 * 60_000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      // 멤버 목록에 내 닉네임이 박혀 있다. 바꾼 이름이 시작 대기 화면에도 바로 보여야 한다.
      queryClient.invalidateQueries({ queryKey: queryKeys.allGroups });
    },
  });
}
