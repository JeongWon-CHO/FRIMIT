import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SharedOrbitRing } from '@/components/orbit';
import { OnboardingFrame } from '@/components/onboarding';
import { AppText, ButtonStack } from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';
import { ensureSession } from '@/lib/supabase';

/**
 * 02 · 로그인.
 *
 * 지금 두 버튼이 하는 일은 **익명 세션 하나를 만드는 것**이다. Apple·Google
 * provider는 아직 붙어 있지 않다. 화면을 먼저 세워 두는 이유는 뒤의 열네 장이
 * 이 자리를 전제로 흐르기 때문이고, provider를 붙일 때 바뀌는 것은 이 함수
 * 한 줄뿐이다(익명 계정은 `linkIdentity`로 승격되므로 그때까지 만든 그룹과
 * 사용량이 그대로 따라간다).
 *
 * 애플 버튼에 SF Symbols 사과 글리프를 그리지 않는다 — 공식 에셋이 아니면
 * 텍스트만 쓰는 것이 애플의 요구다.
 */
export default function SignInScreen() {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = (provider: 'apple' | 'google') => async () => {
    setBusy(provider);
    setError(null);
    try {
      await ensureSession();
      router.push('/nickname');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 380, opacity: 0.34, x: 169, y: 100 }}
      footer={
        <ButtonStack>
          {error && (
            <AppText variant="metadata" tone="over">
              {error}
            </AppText>
          )}
          <WhiteButton
            label="Continue with Apple"
            loading={busy === 'apple'}
            onPress={signIn('apple')}
          />
          <WhiteButton
            label="Continue with Google"
            loading={busy === 'google'}
            onPress={signIn('google')}
            google
          />
          <AppText variant="metadata" tone="faint" style={styles.legal}>
            계속하면 서비스 약관과 개인정보 처리방침에 동의하게 돼요.
          </AppText>
        </ButtonStack>
      }>
      <View style={styles.top}>
        <View style={styles.mark}>
          <SharedOrbitRing
            size={96}
            progress={0.84}
            gradient={gradients.sharedPool.colors}
            strokeRatio={0.16}
          />
        </View>

        <AppText variant="screenTitle" style={styles.title}>
          시작해볼까요
        </AppText>
        <AppText variant="body" tone="muted" style={styles.body}>
          계정으로 로그인하면 친구들과{'\n'}같은 시간 풀에 연결돼요.
        </AppText>
      </View>

      <View />
    </OnboardingFrame>
  );
}

function WhiteButton({
  label,
  onPress,
  loading,
  google,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  google?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(loading) }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.white, pressed && styles.dim]}>
      {loading ? (
        <ActivityIndicator color={colors.text.onLight} />
      ) : (
        <AppText variant="buttonLarge" style={google ? styles.googleLabel : styles.appleLabel}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { gap: 10 },
  mark: { marginTop: 26, marginBottom: 16 },
  title: { fontSize: 32, lineHeight: 38 },
  body: { fontSize: 15, lineHeight: 22 },
  white: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.button,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  dim: { opacity: 0.9 },
  appleLabel: { color: '#050507' },
  googleLabel: { color: '#1F1F1F' },
  legal: { textAlign: 'center', lineHeight: 17 },
});
