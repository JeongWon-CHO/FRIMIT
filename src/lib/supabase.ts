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

/**
 * 세션이 없으면 익명으로 하나 만든다.
 *
 * 온보딩에서 Apple·Google 로그인을 붙이기 전까지의 임시 수단이 아니라, 그 자체로
 * 쓸 수 있는 경로다. 익명 계정은 나중에 `linkIdentity`로 실제 계정에 승격시킬 수
 * 있어서, 지금 만든 그룹과 사용량 기록이 그대로 따라간다.
 *
 * ⚠️ 대시보드에서 Anonymous sign-ins를 켜 두어야 동작한다.
 */
export async function ensureSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: created, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`익명 로그인에 실패했습니다: ${error.message}`);
  }
  if (!created.session) {
    throw new Error('익명 로그인은 됐지만 세션이 없습니다.');
  }

  return created.session.user.id;
}
