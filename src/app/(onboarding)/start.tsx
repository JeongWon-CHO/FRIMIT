import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton, ChoiceCard, CodeEntryField, OnboardingFrame } from '@/components/onboarding';
import { AppText, Avatar, GradientButton } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { avatarPosition } from '@/lib/orbit';

/**
 * 07 · 만들기 또는 참여하기.
 *
 * 온보딩의 사회적 절반으로 갈라지는 자리다. 두 카드를 같은 크기로 두지 않는다 —
 * 크기와 빛의 차이가 곧 추천이고, 코드를 받고 온 사람은 이미 무엇을 할지 안다.
 *
 * 초대 코드는 **숫자 여섯 자리**다(서버 제약 `^[0-9]{6}$`). 디자인의 `FRM-`
 * 접두사는 보여줄 때만 붙이는 장식이라 입력에서는 받지 않는다.
 *
 * 이제 온보딩의 일부가 아니라 **홈에서 들어오는 문**이다. 그래서 뒤로 가기가
 * 있다 — 그룹을 더 만들 생각이 없어진 사람이 여기 갇히면 안 된다.
 */
export default function CreateOrJoinScreen() {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const submit = () => router.push({ pathname: '/invite', params: { code } });

  return (
    <OnboardingFrame
      footer={
        joining ? (
          <GradientButton
            label="참여하기"
            onPress={submit}
            disabled={code.length !== 6}
          />
        ) : undefined
      }>
      <View style={styles.top}>
        <BackButton />

        <AppText variant="screenTitle" style={styles.title}>
          혼자서는 시작할 수 없어요
        </AppText>
        <AppText variant="body" tone="muted">
          공동 시간은 친구가 있어야 흘러요.
        </AppText>
      </View>

      <View style={styles.cards}>
        <ChoiceCard
          emphasis="primary"
          title="그룹 만들기"
          caption="친구들과 하나의 시간을 시작해요"
          onPress={() => router.push('/group')}
          figure={<MiniOrbit />}
        />

        <ChoiceCard
          emphasis="secondary"
          title="초대로 참여하기"
          caption="6자리 코드를 입력해요"
          onPress={() => setJoining(true)}
          figure={<CodeEntryField value={code} onChange={setCode} />}
        />
      </View>
    </OnboardingFrame>
  );
}

/** 만들기 카드의 작은 그림 — 나 하나와 비어 있는 자리 셋. */
function MiniOrbit() {
  const size = 64;

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.miniRing, { width: size, height: size, borderRadius: size / 2 }]} />
      <View style={styles.miniCenter}>
        <Avatar id="me" name="정" size={24} borderColor="#13131F" />
      </View>

      {[-90, 30, 150].map((angle) => {
        const { x, y } = avatarPosition(angle, 32);
        return (
          <View
            key={angle}
            style={[
              styles.miniSeat,
              { left: size / 2 + x - 7, top: size / 2 + y - 7 },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // 제목은 프레임의 공통 헤더가 아니라 이 화면이 직접 그리는 블록이다.
  // 카드가 가운데를 차지하므로 제목은 그 위에서 조금 내려와 앉는다.
  top: { gap: 9, paddingTop: 12 },
  title: { fontSize: 30, lineHeight: 38 },
  cards: { gap: 14, flex: 1, justifyContent: 'center', paddingBottom: 8 },
  miniRing: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border.dashed,
  },
  miniCenter: { position: 'absolute', left: 20, top: 20 },
  miniSeat: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border.dashed,
  },
});
