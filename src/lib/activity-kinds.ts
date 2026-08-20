/**
 * 서버와 나눠 갖는 활동 어휘.
 *
 * `avatars.ts`와 같은 이유로 따로 있다 — **네트워크에 닿지 않기 때문**이다.
 * `activity.ts`는 supabase를 들고 있어서, 여기 값들이 거기 있으면 순수 로직
 * 테스트가 react-native까지 끌고 들어온다.
 *
 * 두 목록 다 서버의 정의와 같아야 한다: `activity_kind` 열거형(0008·0010)과
 * `reactions.emoji`의 check 제약(0011).
 */

/**
 * 타입이 아니라 배열인 이유는 테스트가 이걸 훑기 위해서다. 유니온 타입은 실행
 * 중에 셀 수 없어서, 종류를 더하고 문장을 빠뜨려도 테스트가 조용히 지나간다.
 * 실제로 콕 찌르기를 붙일 때 그렇게 빠뜨렸다.
 */
export const ACTIVITY_KINDS = [
  'group_started',
  'member_joined',
  'member_left',
  'rule_changed',
  'pool_threshold',
  'pool_over',
  'goal_created',
  'goal_entry',
  'goal_cleared',
  'goal_cancelled',
  'nudge',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** 쓸 수 있는 반응. 자유 입력을 열면 신고·검수 부담이 따라온다. */
export const REACTION_EMOJI = ['👏', '🔥', '😂', '😮', '👀'] as const;
