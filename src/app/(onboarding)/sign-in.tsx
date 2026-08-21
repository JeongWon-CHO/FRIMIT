import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SharedOrbitRing } from '@/components/orbit';
import { BackButton, OnboardingFrame } from '@/components/onboarding';
import { AppText } from '@/components/ui';
import { colors, gradients, radius as radii } from '@/constants/design-tokens';
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { resolveRouteAfterSignIn } from '@/lib/onboarding';

/**
 * 02 · 로그인.
 *
 * 이 앱에 다른 입구는 없다. 로그인을 건너뛸 수 있게 하면 그룹·목표·사용량이
 * 다시 로그인할 방법 없는 계정에 쌓이고, 기기를 바꾼 순간 전부 사라진다.
 *
 * Apple 버튼은 **iOS에서만 그린다.** Android에서 Apple로 들어가려면 웹 OAuth를
 * 태워야 하는데, 그러려면 Services ID와 .p8 서명 키를 따로 세워야 한다. 심사
 * 지침 4.8이 Apple 로그인을 요구하는 것은 iOS이므로 그 비용을 지금 낼 이유가
 * 없다. 판정은 `isAppleSignInAvailable()`에 있고 iOS 12 이하도 같이 걸러진다.
 *
 * 애플 버튼에 SF Symbols 사과 글리프를 그리지 않는다 — 공식 에셋이 아니면
 * 텍스트만 쓰는 것이 애플의 요구다.
 */
export default function SignInScreen() {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 판정이 끝나기 전에는 Apple 버튼을 그리지 않는다. `Platform.OS`로 바로
  // 그려 두면 iOS 12에서 눌러야만 안 된다는 걸 알게 된다.
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    let alive = true;
    isAppleSignInAvailable()
      .then((available) => {
        if (alive) setAppleReady(available);
      })
      .catch(() => {
        if (alive) setAppleReady(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = (provider: 'apple' | 'google') => async () => {
    // 두 시트를 동시에 띄우면 iOS가 뒤엣것을 조용히 무시한다.
    if (busy) return;

    setBusy(provider);
    setError(null);
    try {
      const outcome = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();

      // 스스로 시트를 내린 것이므로 아무 말도 하지 않고 이 화면에 남는다.
      if (outcome === 'canceled') return;

      /*
       * 다음 화면은 되짚기가 정한다. 기기를 바꾼 사람은 닉네임도 그룹도 이미
       * 서버에 있어서 03을 다시 볼 이유가 없다(스펙 02 "Existing account with
       * groups → Today directly").
       *
       * `replace`인 이유: 로그인이 끝난 뒤 뒤로 가기로 이 화면에 돌아오면
       * 이미 로그인된 사람에게 로그인 버튼 두 개가 보인다.
       */
      router.replace(await resolveRouteAfterSignIn());
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
        // 흰 버튼 둘이 붙어 있으면 한 덩어리로 뭉쳐서 아래가 무거워진다.
        // 사이를 벌리고 법적 문구 앞에 한 칸 더 둔다.
        <View style={styles.actions}>
          {error && (
            <AppText variant="metadata" tone="over">
              {error}
            </AppText>
          )}
          {appleReady && (
            <WhiteButton
              label="Apple로 계속하기"
              loading={busy === 'apple'}
              disabled={busy !== null}
              onPress={signIn('apple')}
            />
          )}
          <WhiteButton
            label="Google로 계속하기"
            loading={busy === 'google'}
            disabled={busy !== null}
            onPress={signIn('google')}
            google
          />
          <AppText variant="metadata" tone="faint" style={styles.legal}>
            계속하면 서비스 약관과 개인정보 처리방침에 동의하게 돼요.
          </AppText>
        </View>
      }>
      <View style={styles.top}>
        <BackButton />

        <View style={styles.mark}>
          <SharedOrbitRing
            size={96}
            progress={0.84}
            gradient={gradients.sharedPool.colors}
            strokeRatio={0.16}
          />
        </View>

        <AppText variant="screenTitle" style={styles.title}>
          시작해 볼까요
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
  disabled,
  google,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  /** 다른 버튼이 일하는 중. 이쪽은 스피너 없이 눌리지만 않는다. */
  disabled?: boolean;
  google?: boolean;
}) {
  const blocked = Boolean(loading || disabled);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
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
  mark: { marginTop: 40, marginBottom: 22, alignSelf: 'center' },
  actions: { gap: 14 },
  title: { fontSize: 32, lineHeight: 38, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
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
  legal: { textAlign: 'center', lineHeight: 17, paddingTop: 6 },
});
