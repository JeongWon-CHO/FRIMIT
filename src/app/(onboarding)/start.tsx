import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BackButton, ChoiceCard, CodeBoxes, OnboardingFrame } from '@/components/onboarding';
import { AppText, Avatar } from '@/components/ui';
import { colors } from '@/constants/design-tokens';
import { avatarPosition } from '@/lib/orbit';

/**
 * 07 · 만들기 또는 참여하기.
 *
 * 온보딩의 사회적 절반으로 갈라지는 자리다. 두 카드를 같은 크기로 두지 않는다 —
 * 크기와 빛의 차이가 곧 추천이고, 코드를 받고 온 사람은 이미 무엇을 할지 안다.
 *
 * 참여 카드의 상자 여섯 개는 **그림이다**. 여기서 코드를 받으려고 했더니 키보드가
 * 올라오는 순간 입력칸이 키보드와 버튼 사이에 끼어 보이지 않았다 — 제목과 카드 두
 * 장이 있는 화면에서 키보드가 절반을 먹으면 남는 자리가 없다. 입력은 08이 화면
 * 하나를 통째로 쓴다.
 *
 * 이제 온보딩의 일부가 아니라 **홈에서 들어오는 문**이다. 그래서 뒤로 가기가
 * 있다 — 그룹을 더 만들 생각이 없어진 사람이 여기 갇히면 안 된다.
 */
export default function CreateOrJoinScreen() {
  return (
    <OnboardingFrame>
      <View style={styles.top}>
        <BackButton />

        {/*
          예전 제목은 "혼자서는 시작할 수 없어요"였다. 사실이긴 하지만 갈림길에서
          할 말은 아니다 — 무엇을 고르라는 화면인데 못 하는 것부터 말했다.
        */}
        <AppText variant="screenTitle" style={styles.title}>
          어떻게 시작할까요?
        </AppText>
        <AppText variant="body" tone="muted">
          그룹을 만들거나, 받은 코드로 참여해요.
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
          onPress={() => router.push('/invite')}
          figure={<CodeBoxes value="" />}
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
  //
  // 뒤로가기는 프레임이 주는 위 여백(28 + 안전 영역)에 바로 붙인다. 여기에 더
  // 얹으면 시스템 뒤로가기가 있을 자리보다 한참 아래에 떠서, 화면을 벗어나는
  // 버튼이 아니라 내용의 일부처럼 읽힌다.
  top: { gap: 9 },
  // 뒤로가기와 제목 사이만 벌린다. `gap`을 키우면 제목과 부제 사이도 같이
  // 벌어져서 한 덩어리로 읽히던 두 줄이 갈라진다.
  title: { fontSize: 30, lineHeight: 38, marginTop: 13 },
  // 제목 바로 아래에 붙인다. `center`로 두면 카드가 화면 한가운데로 내려가서
  // 제목과 갈라지고, 고를 것 둘이 저 아래 따로 떠 있는 것처럼 보인다.
  cards: { gap: 14, flex: 1, paddingBottom: 8 },
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
