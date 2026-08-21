# 로그인 설정 (Apple · Google)

코드만으로는 로그인이 동작하지 않는다. 아래 셋이 서로를 가리키고 있어야 한다 —
앱의 스킴, Supabase의 provider 설정, 각 공급자 콘솔의 클라이언트. 하나라도
어긋나면 증상이 **로그인 화면에서 나지 않는다**: 브라우저까지 잘 갔다가 돌아오지
않거나, 돌아왔는데 토큰이 없다.

관련 코드는 `src/lib/auth.ts`(흐름)와 `src/lib/oauth-callback.ts`(돌아온 URL 해석).

---

## 0. 두 공급자가 다른 길을 간다

| | 경로 | 필요한 것 |
|---|---|---|
| Apple | iOS 네이티브 시트 (`expo-apple-authentication` → `signInWithIdToken`) | App ID의 Sign in with Apple 능력, Supabase Apple provider의 Client IDs |
| Google | 브라우저 (`signInWithOAuth` → `openAuthSessionAsync` → `setSession`) | Google Cloud의 **웹** OAuth 클라이언트, Supabase Google provider |

Apple 버튼은 **iOS에서만 그린다**(`isAppleSignInAvailable()`). Android에서 Apple로
들어가려면 Services ID와 `.p8` 서명 키를 따로 세워 웹 흐름을 태워야 하는데, 심사
지침 4.8이 Apple 로그인을 요구하는 것은 iOS다. 그 비용을 지금 낼 이유가 없다.

Google은 반대로 **두 플랫폼 모두 브라우저**로 간다. 네이티브 경로
(`@react-native-google-signin`)를 쓰면 OAuth 클라이언트가 iOS·Android·웹 세 벌로
늘고 config plugin과 재빌드가 따라온다.

---

## 1. Supabase 대시보드

프로젝트: `igsuzpjiifjgjjentfjp`

### Redirect URLs (Authentication → URL Configuration)

```
frimit://auth-callback
```

`src/lib/auth.ts`의 `Linking.createURL('auth-callback')`이 만드는 값이고, 그 앞의
`frimit`은 `app.json`의 `scheme`이다. **셋 중 하나만 바꿔도 셋 다 바꿔야 한다.**

여기 등록돼 있지 않으면 Supabase가 `site_url`로 튕겨 낸다 — 브라우저는 엉뚱한
페이지에 머물고 앱은 영영 돌아오지 않는 시트를 바라본다. 사용자에게는 "화면이
멈췄다"로 보인다.

> Expo Go로 열면 스킴이 `exp://`라 이 등록이 맞지 않는다. 이 앱은 Family Controls
> 때문에 어차피 개발 빌드에서만 도므로 문제가 되지 않지만, 증상이 같아서 헷갈릴
> 수 있다.

### Apple provider (Authentication → Providers → Apple)

- **Enable**: 켠다
- **Client IDs**: `com.frimit.app` — `app.json`의 `ios.bundleIdentifier`

네이티브 흐름만 쓰므로 **Secret Key(.p8)·Team ID·Services ID는 비워 둔다.** 그
칸들은 웹 OAuth용이고, 우리는 기기가 받은 identity token을 그대로 검증만 시킨다
(`signInWithIdToken`). 나중에 Android에서도 Apple을 열게 되면 그때 Services ID를
만들고 **Client IDs의 첫 항목**으로 넣는다(Supabase 문서의 요구 순서다).

### Google provider (Authentication → Providers → Google)

- **Enable**: 켠다
- **Client ID / Client Secret**: 아래 2번에서 만드는 **웹** 클라이언트의 값
- **Authorized Client IDs**: 비워 둔다 — 네이티브 흐름을 쓸 때만 쓰는 칸이다

### Anonymous sign-ins

**켠 채로 둔다.** 제품 경로에서는 쓰지 않지만 `spike.tsx`가
`signInAnonymouslyForDev()`로 쓴다. 그 함수는 `__DEV__` 밖에서 던지므로 릴리스
빌드에서는 호출될 수 없다(`src/lib/supabase.ts`).

---

## 2. Google Cloud Console

1. OAuth consent screen을 만든다(External, 테스트 사용자에 베타 참가자 추가).
2. Credentials → Create credentials → OAuth client ID → **Web application**.
3. Authorized redirect URIs에 Supabase의 콜백을 넣는다:

```
https://igsuzpjiifjgjjentfjp.supabase.co/auth/v1/callback
```

여기 들어가는 것은 **Supabase 주소**지 `frimit://`가 아니다. 순서가 이렇다 —
Google → Supabase → 앱. Google은 앱의 스킴을 알지 못하고, 알 필요도 없다.

iOS·Android용 클라이언트는 만들지 않는다. 브라우저 흐름에서는 웹 클라이언트
하나로 두 플랫폼이 같이 돈다.

---

## 3. Apple Developer

App ID(`com.frimit.app`)에 **Sign in with Apple** 능력을 켠다. `app.json`의
`ios.usesAppleSignIn: true`가 앱 쪽 entitlement를 넣고, EAS가 빌드할 때 App ID에
같은 능력이 없으면 프로비저닝에서 막힌다.

`.p8` 키와 Services ID는 만들지 않는다 — 1번에서 적은 이유와 같다.

---

## 4. 재빌드가 필요하다

`expo-apple-authentication`은 네이티브 모듈이라 JS만 갱신해서는 붙지 않는다.
기존 개발 빌드에서는 `isAppleSignInAvailable()`이 `false`를 돌려주고 **Apple
버튼이 아예 그려지지 않는다** — 오류가 아니라 버튼이 없는 화면으로 보인다.

```bash
npm run ios            # 로컬 개발 빌드
npm run verify:prebuild  # entitlement가 clean prebuild를 견디는지
```

`verify:prebuild`가 `com.apple.developer.applesignin`을 확인한다. 이 파일에 쓰는
주체가 둘이라(expo 기본 mod와 `withFrimitScreenTime`) 한쪽이 다른 쪽 키를 지울 수
있는데, 그때 나는 증상은 빌드 실패가 아니라 실기기에서 **Apple 시트가 뜨자마자
닫히는 것**이다.

---

## 5. 확인

```bash
npm run db:verify   # "로그인 —" 두 섹션이 트리거·비석 쪽을 본다
```

이 스크립트는 공급자를 태우지 않는다. 공급자 흐름은 서버가 아니라 기기에서
끝나므로 실기기로 확인할 것:

- [ ] iOS에서 Apple 버튼이 보이고, 시트가 뜨고, 닉네임 화면(03)으로 넘어간다
- [ ] Android에서 Apple 버튼이 **안 보인다**
- [ ] 두 플랫폼에서 Google 브라우저가 열리고 닫히면서 앱으로 돌아온다
- [ ] 시트를 쓸어내려 취소하면 오류 문구 없이 로그인 화면에 남는다
- [ ] 로그인한 계정으로 MY → 로그아웃 → 다시 로그인하면 그룹이 그대로 있다
- [ ] 그 상태에서 앱을 지웠다 다시 깔아도 같은 계정으로 들어가진다 (이게 로그인을
      필수로 만든 이유다)
