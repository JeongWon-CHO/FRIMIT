import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing } from 'react-native-reanimated';

import { motion } from '@/constants/design-tokens';

/**
 * 움직임 규칙 한 곳.
 *
 * 토큰의 easing은 숫자 배열이라 Reanimated에 그대로 넣을 수 없다. 여기서 한 번만
 * 변환한다 — 화면마다 `Easing.bezier(0.22, 1, 0.36, 1)`를 다시 적으면 그중 하나가
 * 조용히 달라진다.
 */
export const EASE = {
  standard: Easing.bezier(...(motion.easing.standard as [number, number, number, number])),
  press: Easing.bezier(...(motion.easing.press as [number, number, number, number])),
};

/**
 * 시스템의 "동작 줄이기" 설정.
 *
 * 켜져 있으면 반복 애니메이션과 회전을 전부 끄고, 세는 숫자는 곧바로 최종값으로
 * 놓는다. 크로스페이드는 남긴다 — 그건 어지럼증을 만들지 않으면서 상태가
 * 바뀌었다는 사실을 전한다.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * 값이 바뀔 때 숫자를 세어 올린다.
 *
 * 큰 숫자가 툭 바뀌면 동기화가 일어났다는 사실이 눈에 걸리지 않는다. 프레임마다
 * `<Text>`를 새로 만들지 않도록 30fps로 제한한다 — 그 위로는 보이지도 않는다.
 *
 * 동작 줄이기가 켜져 있으면 세지 않고 곧바로 놓는다.
 */
export function useCountingValue(target: number, reduced: boolean): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const started = useRef(0);

  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }

    const start = from.current;
    const delta = target - start;
    started.current = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - started.current;
      const t = Math.min(1, elapsed / motion.duration.slow);

      setValue(Math.round(start + delta * t));

      if (t >= 1) {
        from.current = target;
        clearInterval(timer);
      }
    }, 33);

    return () => {
      clearInterval(timer);
      from.current = target;
    };
  }, [target, reduced]);

  return value;
}
