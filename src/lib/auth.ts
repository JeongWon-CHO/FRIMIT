import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { isCanceledCallback, parseOAuthCallback } from './oauth-callback';
import { supabase } from './supabase';

/**
 * 로그인. Apple은 iOS 네이티브 시트로, Google은 브라우저로 간다.
 *
 * 두 공급자가 다른 길을 가는 이유는 취향이 아니다. iOS에서 Apple 로그인을
 * 웹으로 띄우면 이미 기기에 로그인된 Apple ID를 두고 사용자가 비밀번호를 다시
 * 치게 된다 — 심사 지침 이전에 그냥 나쁜 흐름이다. Google은 반대로 네이티브
 * 경로(`@react-native-google-signin`)를 쓰려면 OAuth 클라이언트 세 벌과 config
 * plugin, 그리고 재빌드가 따라오는데, 브라우저 흐름이 이미 두 플랫폼에서 같은
 * 코드로 동작한다.
 *
 * ## 계정은 승격되지 않는다
 *
 * 예전 주석은 `linkIdentity()`로 익명 계정을 승격시킨다고 적혀 있었다. 그
 * 전제는 사라졌다 — 익명 계정은 개발용이고 사용자 데이터가 붙어 있지 않다
 * (`supabase.ts`의 `signInAnonymouslyForDev`). 그래서 여기서는 승격이 아니라
 * 그냥 로그인한다. 승격 경로를 남겨 두면 "이미 그 Apple ID로 만든 계정이
 * 있습니다"(identity_already_exists)를 사용자에게 설명해야 하는데, 설명할 만한
 * 상황 자체가 존재하지 않는다.
 *
 * ## 취소는 실패가 아니다
 *
 * 세 함수 모두 취소를 `'canceled'`로 **돌려준다.** 던지지 않는 이유는 화면
 * 때문이다 — 던지면 로그인 화면이 빨간 줄을 하나 띄우는데, 사용자가 방금 스스로
 * 시트를 내린 것이라 그건 알려 줄 소식이 아니다.
 */

// 웹에서만 의미가 있다(팝업으로 돌아온 창을 닫는다). 네이티브에서는 아무 일도
// 하지 않지만, 호출 위치가 "리다이렉트를 받는 모듈"이어야 해서 여기 둔다.
WebBrowser.maybeCompleteAuthSession();

export type SignInOutcome = 'signedIn' | 'canceled';

/**
 * 브라우저가 돌아올 주소.
 *
 * `app.json`의 `scheme`("frimit")을 그대로 쓴다. 이 값은 Supabase 대시보드의
 * Redirect URLs에 **똑같이** 등록돼 있어야 한다. 안 되어 있으면 공급자 화면까지
 * 잘 갔다가 마지막에 site_url로 튕겨 나가고, 앱은 영영 돌아오지 않는 브라우저를
 * 바라보게 된다.
 */
const redirectTo = Linking.createURL('auth-callback');

/** 로그인 화면이 Apple 버튼을 그릴지 정한다. Android와 iOS 12 이하에서 false. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<SignInOutcome> {
  let identityToken: string | null = null;

  try {
    /*
     * 이름(FULL_NAME)은 요구하지 않는다. 다음 화면이 닉네임을 직접 받으므로
     * 쓸 자리가 없고, Apple은 첫 로그인에서만 이름을 주기 때문에 "받아 두고
     * 안 쓰는 값"은 그냥 지우지 못하는 개인정보로 남는다.
     *
     * 이메일은 받는다. 계정에 사람이 닿을 수 있는 값이 하나도 없으면 기기를
     * 잃었을 때 문의를 받아도 어느 계정인지 확인할 방법이 없다.
     */
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    identityToken = credential.identityToken;
  } catch (caught) {
    if (isAppleCancel(caught)) return 'canceled';
    throw new Error(`Apple 로그인에 실패했어요: ${messageOf(caught)}`);
  }

  if (!identityToken) {
    // signInAsync가 성공했는데 토큰이 없는 경우다. 사용자가 할 수 있는 일이
    // 없으므로 다시 시도해 보라고만 말한다.
    throw new Error('Apple에서 로그인 정보를 받지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });
  if (error) throw new Error(`로그인하지 못했어요: ${error.message}`);

  return 'signedIn';
}

export async function signInWithGoogle(): Promise<SignInOutcome> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // 브라우저는 우리가 직접 연다. 이걸 빼면 supabase-js가 웹에서 현재
      // 창을 통째로 이동시키고, 네이티브에서는 아무 일도 일어나지 않는다.
      skipBrowserRedirect: true,
    },
  });
  if (error) throw new Error(`로그인을 시작하지 못했어요: ${error.message}`);
  if (!data.url) throw new Error('로그인 주소를 받지 못했어요.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  /*
   * 'cancel'은 사용자가 취소를 누른 것이고 'dismiss'는 시트를 쓸어내린 것이다.
   * 사용자 입장에서는 같은 동작이라 나누지 않는다.
   */
  if (result.type !== 'success') return 'canceled';

  const callback = parseOAuthCallback(result.url);

  // 공급자 화면에서 "취소"를 누르면 성공적으로 돌아오되 error=access_denied를
  // 달고 온다. 브라우저를 닫은 것과 같은 취소다.
  if (isCanceledCallback(callback)) return 'canceled';

  if (callback.kind === 'error') {
    throw new Error(`로그인하지 못했어요: ${callback.message ?? callback.code}`);
  }
  if (callback.kind === 'none') {
    // 리다이렉트는 돌아왔는데 토큰이 없다. Redirect URLs 등록 누락이 거의
    // 항상 원인이라, 사용자에게는 재시도를, 우리에게는 단서를 남긴다.
    throw new Error('로그인 결과를 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: callback.accessToken,
    refresh_token: callback.refreshToken,
  });
  if (sessionError) throw new Error(`로그인하지 못했어요: ${sessionError.message}`);

  return 'signedIn';
}

/**
 * 로그아웃.
 *
 * 실패해도 던지지 않는다. `signOut`이 실패하는 경우는 서버에 닿지 못했을 때인데,
 * 그때도 기기의 저장된 세션은 지워진다(supabase-js가 로컬을 먼저 비운다).
 * 사용자에게는 이미 나간 것으로 보이므로, 오류를 띄우면 "나간 건가 만 건가"만
 * 남는다.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

function isAppleCancel(caught: unknown): boolean {
  return (
    typeof caught === 'object' &&
    caught !== null &&
    'code' in caught &&
    (caught as { code?: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
