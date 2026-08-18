import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SharedOrbitRing } from '@/components/orbit';
import { OnboardingFrame } from '@/components/onboarding';
import { AppText, ButtonStack, GradientButton } from '@/components/ui';
import { colors, gradients } from '@/constants/design-tokens';
import { avatarPosition } from '@/lib/orbit';

/**
 * 01 · 환영.
 *
 * 한 문장만 말한다: 친구들이 하나의 시간을 나눠 쓴다. 이 화면에는 아직 사람이
 * 없으므로 아바타 대신 **빛 넷**이 자리에 앉는다 — 하나는 밝고 셋은 흐리다.
 * 그 배치가 뒤에 나올 좌석들의 예고다.
 */
const LIGHTS = [
  { angle: -90, size: 16, color: '#EDE9FE' },
  { angle: 0, size: 10, color: colors.accent.cyan },
  { angle: 90, size: 10, color: colors.accent.blueSoft },
  { angle: 180, size: 10, color: colors.accent.violetPale },
];

const ORBIT = 250;

export default function WelcomeScreen() {
  return (
    <OnboardingFrame
      ambient={{ color: colors.accent.violet, size: 440, opacity: 0.4, x: 169, y: 120 }}
      footer={
        <View style={styles.bottom}>
          <View style={styles.copy}>
            <AppText variant="screenTitle" font="display" style={styles.headline}>
              Less screen.{'\n'}More together.
            </AppText>
            <AppText variant="body" tone="muted" style={styles.subline}>
              친구들과 하루 시간을 하나로 묶고{'\n'}같이 아껴 쓰는 방법.
            </AppText>
          </View>

          <ButtonStack>
            <GradientButton label="Get started" onPress={() => router.push('/sign-in')} />
            <GradientButton
              label="I have an invite"
              variant="secondary"
              onPress={() => router.push('/start')}
            />
          </ButtonStack>
        </View>
      }>
      <AppText variant="numericLabel" tone="muted" style={styles.wordmark}>
        FRIMIT
      </AppText>

      <View style={styles.orbitBox}>
        <SharedOrbitRing
          size={ORBIT}
          progress={0.92}
          gradient={gradients.sharedPool.colors}
          showTrackDashes
          strokeRatio={0.14}
          glow="soft"
        />

        {LIGHTS.map((light) => {
          const { x, y } = avatarPosition(light.angle, 117);
          return (
            <View
              key={light.angle}
              style={[
                styles.light,
                {
                  width: light.size,
                  height: light.size,
                  borderRadius: light.size / 2,
                  backgroundColor: light.color,
                  shadowColor: light.color,
                  left: ORBIT / 2 + x - light.size / 2,
                  top: ORBIT / 2 + y - light.size / 2,
                },
              ]}
            />
          );
        })}
      </View>

    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  wordmark: { letterSpacing: 3 },
  orbitBox: { width: ORBIT, height: ORBIT, alignSelf: 'center' },
  light: {
    position: 'absolute',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  bottom: { gap: 22 },
  copy: { gap: 12 },
  headline: { fontSize: 38, lineHeight: 44, letterSpacing: -1.3 },
  subline: { fontSize: 15, lineHeight: 22 },
});
