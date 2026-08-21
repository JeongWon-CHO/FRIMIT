import type { PermissionState } from '@modules/screen-time';

/**
 * 권한 상태에서 "지금 사용자가 할 수 있는 일"로.
 *
 * `tracking.ts`와 떼어 둔 이유는 **네이티브에 닿지 않기 때문**이다(`avatars.ts`와
 * 같은 사연). 이 판단은 규칙일 뿐이라 실기기 없이 테스트되어야 한다.
 *
 * 규칙은 PERMISSION_FLOW_SPEC §4가 정한 하나다 — **OS가 아직 물어볼 수 있는가.**
 *   · 있다  → 시스템 요청을 다시 부른다
 *   · 없다  → 설정으로 보낸다
 */

export type PermissionCta = {
  label: string;
  /** 참이면 시스템 설정으로 나간다. 거짓이면 시스템 요청을 부른다. */
  opensSettings: boolean;
};

export function permissionCta(
  permission: PermissionState,
  platform: 'ios' | 'android'
): PermissionCta | null {
  /*
   * 버튼을 만들지 않는 상태들.
   *
   * granted는 할 일이 없고, restricted·unavailable은 **사용자가 켤 수 없다** —
   * 기기 정책이거나 지원하지 않는 기기다. 눌러도 아무 일이 없는 버튼을 두면
   * 사용자는 자기가 뭘 잘못했다고 생각한다. 그때는 이유만 말한다.
   */
  if (permission === 'granted' || permission === 'restricted' || permission === 'unavailable') {
    return null;
  }

  if (permission === 'notDetermined') {
    return {
      // Screen Time은 애플 용어다. Android에서 그 말을 쓰면 찾을 수 없는 설정을
      // 찾게 만든다.
      label: platform === 'ios' ? 'Screen Time 권한 켜기' : '사용 정보 접근 켜기',
      opensSettings: false,
    };
  }

  /*
   * 거절당한 뒤.
   *
   * iOS의 Family Controls는 한 번 거절되면 앱이 다시 물을 수 없다. 그래도 같은
   * 버튼을 두면 눌러도 아무 일이 일어나지 않고, 사용자는 앱이 고장 났다고 읽는다.
   *
   * Android는 `requestPermission`이 애초에 사용 정보 접근 설정 화면을 여는 것이라
   * 다시 불러도 된다. 문구가 양쪽 다 "설정에서 켜기"인 것은 실제로 그렇게 되기
   * 때문이다 — 어느 쪽이든 사용자가 가는 곳은 설정이다.
   */
  return { label: '설정에서 켜기', opensSettings: platform === 'ios' };
}
