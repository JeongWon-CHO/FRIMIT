import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * 순수 로직만 노드에서 돌린다 — 서식, 날짜 경계, 오빗 기하, 풀 상태.
 *
 * 두 가지만 손본다. 하나, `@/`를 tsconfig와 같게 풀어 준다(그러지 않으면 토큰을
 * 읽는 모듈이 전부 실패한다). 둘, 점으로 시작하는 디렉터리를 제외한다 —
 * 스킬 패키지가 자기 테스트를 들고 들어와 우리 결과를 빨갛게 만든다.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@modules': fileURLToPath(new URL('./modules', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
