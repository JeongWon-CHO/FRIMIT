/**
 * OAuth 리다이렉트 URL에서 무엇이 돌아왔는지 읽는다.
 *
 * Supabase의 implicit flow는 세션을 **URL 조각(fragment)** 에 담아 보낸다 —
 * `frimit://auth-callback#access_token=...&refresh_token=...`. 조각은 서버로
 * 전송되지 않으므로 토큰이 중간 어딘가에 기록될 자리가 없다. 반면 오류는
 * 공급자에 따라 조각이 아니라 질의 문자열(`?error=...`)로 오기도 한다. 그래서
 * 둘 다 읽어 합친다.
 *
 * PKCE(`?code=...`)를 쓰지 않는 이유는 Hermes에 `crypto.subtle`이 없기 때문이다.
 * 그 환경에서 supabase-js는 code_challenge를 `plain`으로 떨어뜨리는데(auth-js의
 * `generatePKCEChallenge`), 검증자를 그대로 실어 보내는 PKCE는 지켜 주는 것이
 * 사실상 없다. 이름만 PKCE인 흐름보다 조각으로 받는 편이 정직하다.
 *
 * 손으로 파싱하는 이유는 `URL`이다. React Native의 `URL`은 `http(s)`가 아닌
 * 스킴에서 `hash`·`search`를 제대로 채우지 않는다. 여기서 다루는 것은 전부
 * `frimit://`라 그 구현을 믿을 수 없다.
 */

export type OAuthCallback =
  /** 로그인이 끝났고 세션을 세울 수 있다. */
  | { kind: 'session'; accessToken: string; refreshToken: string }
  /** 공급자나 Supabase가 거절했다. */
  | { kind: 'error'; code: string; message: string | null }
  /** 우리가 기다리던 URL이 아니다(다른 딥링크가 같은 스킴으로 들어온 경우). */
  | { kind: 'none' };

/**
 * `?`와 `#` 뒤에 붙은 것을 전부 모아 하나의 표로 만든다.
 *
 * 뒤에 나온 값이 이긴다 — 조각이 질의보다 뒤에 오므로, 두 곳에 같은 이름이
 * 있으면 조각 쪽이 남는다. Supabase가 세션을 싣는 자리가 조각이다.
 */
function collectParams(url: string): Map<string, string> {
  const params = new Map<string, string>();

  const start = url.search(/[?#]/);
  if (start === -1) return params;

  for (const chunk of url.slice(start + 1).split(/[?#]/)) {
    for (const pair of chunk.split('&')) {
      if (!pair) continue;

      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);

      try {
        // `+`는 폼 인코딩에서만 공백이다. error_description이 그렇게 온다.
        params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue.replace(/\+/g, ' ')));
      } catch {
        // 잘린 퍼센트 인코딩(`%E3`) 하나 때문에 URL 전체를 버리지 않는다.
        params.set(rawKey, rawValue);
      }
    }
  }

  return params;
}

export function parseOAuthCallback(url: string): OAuthCallback {
  const params = collectParams(url);

  /*
   * 오류를 먼저 본다. 사용자가 공급자 화면에서 취소하면 토큰 없이 error만
   * 담겨 오는데, 그때 토큰 유무로 먼저 갈라 버리면 취소가 `none`이 되어
   * "아무 일도 없었다"로 조용히 넘어간다.
   */
  const errorCode = params.get('error_code') ?? params.get('error');
  if (errorCode) {
    return {
      kind: 'error',
      code: errorCode,
      message: params.get('error_description') ?? null,
    };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  /*
   * 둘 다 있어야 한다. access_token만 세워 두면 한 시간 뒤 만료된 순간 갱신할
   * 방법이 없어 사용자가 이유 없이 로그아웃된다.
   */
  if (accessToken && refreshToken) {
    return { kind: 'session', accessToken, refreshToken };
  }

  return { kind: 'none' };
}

/** 사용자가 취소했을 때 공급자들이 쓰는 코드. 오류로 보여 줄 것이 아니다. */
const CANCELED_CODES = new Set(['access_denied', 'user_cancelled_login', 'user_canceled_login']);

export function isCanceledCallback(callback: OAuthCallback): boolean {
  return callback.kind === 'error' && CANCELED_CODES.has(callback.code);
}
