import { Stack } from 'expo-router';

/**
 * 온보딩 스택.
 *
 * 헤더를 쓰지 않는다 — 각 단계가 자기 제목과 진행 표시, 뒤로 가기를 직접 그린다
 * (`OnboardingStep`).
 *
 * `animation: 'fade'`는 취향이 아니라 이 흐름의 성격 때문이다. 기본 iOS 전환은 새
 * 화면이 옆에서 밀려 들어오며 앞 화면을 덮는데, 그건 "들어갔다 나온다"를 뜻한다.
 * 온보딩은 한 자리에서 내용만 바뀌는 퍼널이라 화면이 쌓이는 것처럼 보이면 안 된다.
 * 그래도 스택은 그대로 둔다 — 스택을 버리고 `replace`로 넘기면 앞 단계로 돌아가
 * 닉네임을 고칠 방법이 사라진다.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 180,
      }}
    />
  );
}
