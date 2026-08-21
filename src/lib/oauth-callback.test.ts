import { describe, expect, it } from 'vitest';

import { isCanceledCallback, parseOAuthCallback } from './oauth-callback';

describe('parseOAuthCallback', () => {
  it('조각에 실려 온 세션을 읽는다', () => {
    const url =
      'frimit://auth-callback#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer';

    expect(parseOAuthCallback(url)).toEqual({
      kind: 'session',
      accessToken: 'aaa',
      refreshToken: 'bbb',
    });
  });

  it('refresh_token이 없으면 세션으로 보지 않는다', () => {
    // 이걸 통과시키면 한 시간 뒤 갱신할 수 없는 세션이 세워진다.
    expect(parseOAuthCallback('frimit://auth-callback#access_token=aaa').kind).toBe('none');
  });

  it('질의 문자열로 온 오류를 읽는다', () => {
    const url =
      'frimit://auth-callback?error=access_denied&error_code=access_denied&error_description=User+did+not+authorize';

    expect(parseOAuthCallback(url)).toEqual({
      kind: 'error',
      code: 'access_denied',
      message: 'User did not authorize',
    });
  });

  it('조각으로 온 오류도 읽는다', () => {
    expect(parseOAuthCallback('frimit://auth-callback#error=server_error')).toEqual({
      kind: 'error',
      code: 'server_error',
      message: null,
    });
  });

  it('error_code가 error보다 구체적이므로 그쪽을 쓴다', () => {
    const url = 'frimit://auth-callback#error=invalid_request&error_code=bad_oauth_state';

    expect(parseOAuthCallback(url)).toMatchObject({ code: 'bad_oauth_state' });
  });

  it('질의와 조각이 같이 오면 둘 다 읽는다', () => {
    const url = 'frimit://auth-callback?foo=1#access_token=aaa&refresh_token=bbb';

    expect(parseOAuthCallback(url).kind).toBe('session');
  });

  it('퍼센트 인코딩을 푼다', () => {
    const url = 'frimit://auth-callback#error=server_error&error_description=%EC%8B%A4%ED%8C%A8';

    expect(parseOAuthCallback(url)).toMatchObject({ message: '실패' });
  });

  it('망가진 인코딩 하나 때문에 URL 전체를 버리지 않는다', () => {
    const url = 'frimit://auth-callback#access_token=a%E3&refresh_token=bbb';

    expect(parseOAuthCallback(url).kind).toBe('session');
  });

  it('우리 URL이 아니면 none', () => {
    expect(parseOAuthCallback('frimit://group/abc').kind).toBe('none');
    expect(parseOAuthCallback('frimit://').kind).toBe('none');
    expect(parseOAuthCallback('').kind).toBe('none');
  });
});

describe('isCanceledCallback', () => {
  it('공급자 화면에서의 취소는 오류로 보여 줄 것이 아니다', () => {
    expect(isCanceledCallback(parseOAuthCallback('frimit://cb#error=access_denied'))).toBe(true);
  });

  it('진짜 실패는 오류다', () => {
    expect(isCanceledCallback(parseOAuthCallback('frimit://cb#error=server_error'))).toBe(false);
  });

  it('세션은 취소가 아니다', () => {
    expect(isCanceledCallback({ kind: 'session', accessToken: 'a', refreshToken: 'b' })).toBe(false);
  });
});
