import { Colors } from '@/constants/theme';

/**
 * 앱 색.
 *
 * 디자인은 다크 전용이라 고를 것이 없다. 훅으로 남겨 둔 이유는 호출부가
 * 20곳이 넘기 때문이다 — 시그니처를 유지한 채 분기만 걷어냈다.
 */
export function useTheme() {
  return Colors.dark;
}
