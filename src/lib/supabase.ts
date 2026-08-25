import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * Supabase 클라이언트 하나. 앱 전체가 이것만 쓴다.
 *
 * 값은 `EXPO_PUBLIC_` 접두사를 가진 환경변수로만 들어온다. 이 접두사가 붙은 값은
 * 번들에 그대로 박히므로, 여기에 secret key를 넣으면 안 된다. publishable key는
 * 애초에 공개를 전제로 만들어진 값이고, 실제 접근 통제는 RLS가 한다.
 *
 * 세션 저장소로 AsyncStorage를 쓴다. SecureStore가 더 안전하지만 값 하나당 2048
 * 바이트 제한이 있어 JWT 세션이 통째로 들어가지 않는 경우가 있다. 조각내는 방법도
 * 있지만, 그 복잡도를 지금 감수할 만큼의 이득은 아니다. 기기가 잠겨 있지 않은
 * 상태에서 저장소를 읽을 수 있는 공격자라면 이미 앱 데이터 전부를 읽을 수 있다.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_ANON_KEY가 필요합니다. .env.local을 확인하세요.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // 딥링크로 세션을 받는 웹 전용 동작. 네이티브에서는 URL을 뒤지지 않는다.
    detectSessionInUrl: false,
  },
});

/**
 * 서버 오류를 화면에 그대로 쓸 문장으로.
 *
 * 두 종류를 가른다. **우리 RPC가 직접 거절한 것**에는 `hint`에 슬러그가 붙고 그
 * `message`는 처음부터 사용자에게 보여줄 한국어다("초대 코드가 올바르지 않습니다.",
 * "방금 찔렀어요. 30분 뒤에 다시 할 수 있어요."). 그건 그대로 내보낸다 — 사용자가
 * 할 수 있는 일을 정확히 말해 주는 문장이다.
 *
 * 나머지는 PostgREST·Postgres·네트워크가 올린 영어다("numeric field overflow",
 * "new row for relation \"goals\" violates check constraint ...", "Could not find
 * the function ... in the schema cache"). 화면에 그대로 흘리면 사용자는 자기가 뭘
 * 잘못했는지도, 뭘 하면 되는지도 알 수 없는 말을 읽는다. 그 문장은 콘솔로 보내고
 * 화면에는 우리가 쓴 문장을 준다.
 *
 * 여기 있는 이유는 이 파일을 모두가 이미 가져다 쓰기 때문이다. 오류를 사람 말로
 * 옮기는 자리가 파일마다 따로 있으면, 한 군데를 고쳐도 나머지가 영어를 뱉는다.
 */
export function rpcError(
  error: { message: string; hint?: string | null },
  whatFailed: string
): Error {
  if (error.hint) return new Error(error.message);

  console.warn(`[supabase] ${whatFailed} — ${error.message}`);
  return new Error(`${whatFailed}. 잠시 후 다시 시도해 주세요.`);
}

/**
 * 토큰 자동 갱신은 앱이 앞에 있을 때만 돌린다.
 *
 * 백그라운드에서 타이머를 돌려 봤자 OS가 재워 버리고, 깨어난 뒤 만료된 토큰으로
 * 요청을 보내는 상황만 만든다. 복귀 시점에 다시 켜는 편이 예측 가능하다.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/** 세션이 필요한 자리에서 던지는 오류. 화면이 이걸 보고 로그인으로 돌려보낸다. */
export class NoSessionError extends Error {
  constructor() {
    super('로그인이 필요합니다.');
    this.name = 'NoSessionError';
  }
}

/** 지금 로그인된 사람. 없으면 `null`. 절대 만들지 않는다. */
export async function getSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * 세션이 있어야만 진행하는 자리.
 *
 * 예전에는 이 함수가 세션이 없으면 **익명으로 하나 만들었다.** 그래서 앱을 처음
 * 켠 사람이 로그인 화면을 보기도 전에 계정 하나가 생겼고, 그 사람이 Apple로
 * 로그인하는 순간 방금 만들어진 빈 계정이 버려졌다. 로그인이 필수가 된 지금
 * 그 경로는 사고밖에 만들지 않는다 — 만들지 않고 던진다.
 *
 * 던지는 쪽이 안전한 이유: 세션 없이 부르는 곳은 전부 서버에 무언가를 쓰려는
 * 자리다. 조용히 `null`을 돌려주면 그 쓰기가 `auth.uid() is null`로 RLS에서
 * 막히고, 사용자에게는 "권한이 없습니다"라는 엉뚱한 문장이 보인다.
 */
export async function requireSession(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new NoSessionError();
  return userId;
}

/**
 * 익명 로그인. **개발 전용이다.**
 *
 * 제품의 로그인 경로는 Apple·Google뿐이고(`lib/auth.ts`), 익명 계정은 화면을
 * 혼자 돌려 보기 위한 수단으로만 남는다. `spike.tsx`가 유일한 사용처다.
 *
 * 릴리스 번들에서 부르면 던진다. 남겨 두는 것과 나가는 것은 다른 문제고, 이
 * 함수로 만들어진 계정은 다시 로그인할 방법이 없어(공급자에 매인 것이 없다)
 * 사용자 손에 들어가면 그대로 잠긴 계정이 된다.
 *
 * ⚠️ 대시보드에서 Anonymous sign-ins를 켜 두어야 동작한다.
 */
export async function signInAnonymouslyForDev(): Promise<string> {
  if (!__DEV__) {
    throw new Error('익명 로그인은 개발 빌드에서만 쓸 수 있습니다.');
  }

  const existing = await getSessionUserId();
  if (existing) return existing;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw rpcError(error, '익명 로그인에 실패했습니다');
  }
  if (!data.session) {
    throw new Error('익명 로그인은 됐지만 세션이 없습니다.');
  }

  return data.session.user.id;
}
