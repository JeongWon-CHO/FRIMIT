import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * 앱이 앞으로 나올 때마다 부른다.
 *
 * 콜백을 리스너에 직접 넘기지 않고 ref를 거친다. 그대로 넘기면 콜백이 새로
 * 만들어질 때마다 구독을 떼었다 다시 걸게 되는데, 이 콜백의 내용은 대개
 * "서버와 동기화"라서 그 자체가 왕복 하나다. 스파이크 화면에서 실제로 겪은
 * 문제이고(src/app/spike.tsx의 handlersRef), 같은 함정을 훅으로 한 번만 푼다.
 */
export function useForeground(callback: () => void): void {
  const latest = useRef(callback);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') latest.current();
    });

    return () => subscription.remove();
  }, []);
}
