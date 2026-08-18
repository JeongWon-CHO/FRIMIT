import type { MyGroup } from '@/lib/groups';

/**
 * 이 화면이 다루는 그룹 하나를 고른다.
 *
 * **id를 받았으면 그 그룹이거나 아무것도 아니다.** 예전에는 못 찾으면 목록의
 * 첫 그룹으로 떨어졌는데, 그러면 방금 삭제한 그룹의 화면이 **다른 그룹의
 * 화면으로 바뀌어** 잠깐 나타난다. 남의 그룹 이름과 인원이 뜬 채로 화면이
 * 넘어가는 것을 실기기에서 봤다. 없으면 없는 것이고, 화면은 그걸 그대로
 * 다뤄야 한다.
 *
 * id 없이 들어오는 경우(그룹을 막 만들고 온 온보딩)에만 첫 그룹을 쓴다.
 *
 * 훅이 아니라 순수 함수여도 되지만, 호출부가 전부 화면 최상단이라 이름을
 * 훅처럼 두는 편이 읽기 쉽다.
 */
export function useScreenGroup(
  groups: MyGroup[] | undefined,
  groupId: string | undefined
): MyGroup | undefined {
  return groupId ? groups?.find((candidate) => candidate.id === groupId) : groups?.[0];
}
