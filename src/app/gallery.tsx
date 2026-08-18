import { View } from 'react-native';

import {
  AppText,
  Avatar,
  AvatarStack,
  Bloom,
  ButtonStack,
  EmptyState,
  GradientButton,
  ProgressBar,
  ScreenFrame,
  StatusPill,
  Surface,
} from '@/components/ui';
import { colors, gradients, typography } from '@/constants/design-tokens';

/**
 * 프리미티브 진열장 — 개발 전용.
 *
 * 토큰이 바뀔 때마다 여기부터 본다. 화면 하나에 모든 변형이 있어야 "버튼만 고쳤는데
 * 알약이 깨졌다"를 바로 잡을 수 있다. 눈으로 확인할 것: **검정이 화면의 80% 이상**,
 * 알약이 블러 없이 유리처럼 보이는가, 아바타 테두리가 자기 아래 표면과 같은 색인가.
 */
const MEMBERS = [
  { id: 'a1b2', name: '정원', emoji: '🐣' },
  { id: 'c3d4', name: '민지', emoji: '🦊' },
  { id: 'e5f6', name: '도형', emoji: '🐧' },
  { id: 'g7h8', name: '수민', emoji: '🐢' },
  { id: 'i9j0', name: '하늘', emoji: '🦉' },
];

export default function GalleryScreen() {
  return (
    <ScreenFrame
      bottomInset={40}
      ambient={{ color: colors.accent.violet, size: 400, opacity: 0.32, x: 60, y: 120 }}>
      <AppText variant="screenTitle">Gallery</AppText>

      <Section title="TYPOGRAPHY">
        {(Object.keys(typography) as (keyof typeof typography)[])
          .filter((key) => key !== 'fontFamily')
          .map((key) => (
            <AppText key={key} variant={key as never}>
              {key} · 42m 남음
            </AppText>
          ))}
      </Section>

      <Section title="BUTTONS">
        <ButtonStack>
          <GradientButton label="Get started" onPress={() => {}} />
          <GradientButton label="I have an invite" variant="secondary" onPress={() => {}} />
          <GradientButton label="Not now" variant="tertiary" onPress={() => {}} />
          <GradientButton label="Loading" onPress={() => {}} loading />
          <GradientButton label="Disabled" onPress={() => {}} disabled />
        </ButtonStack>
      </Section>

      <Section title="PILLS">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label="밤샘 금지단" dotColor={colors.accent.violetSoft} />
          <StatusPill label="집계 중" tone="cyan" dotColor={colors.accent.cyan} />
          <StatusPill label="synced 38m ago" tone="amber" />
          <StatusPill label="42m over" tone="pink" />
          <StatusPill label="LEAST TODAY" tone="gold" />
          <StatusPill label="glass" />
        </View>
      </Section>

      <Section title="AVATARS">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar {...MEMBERS[0]} size="xl" ring="activity" />
          <Avatar {...MEMBERS[1]} size="lg" ring="achievement" />
          <Avatar {...MEMBERS[2]} size="md" />
          <Avatar {...MEMBERS[3]} size="xs" />
          <Avatar id="pending" name="수" size="xs" ring="pending" />
          <Avatar {...MEMBERS[4]} size="micro" dimmed />
        </View>
        <AvatarStack members={MEMBERS} surfaceColor={colors.surface.card} />
        <AvatarStack members={MEMBERS} max={2} size="xs" surfaceColor={colors.surface.card} />
      </Section>

      <Section title="PROGRESS">
        <ProgressBar progress={0.54} height={12} tip />
        <ProgressBar progress={0.75} height={6} />
        <ProgressBar progress={0.3} height={5} gradient={gradients.violetToBlue.colors} />
        <ProgressBar progress={0} height={6} />
        <ProgressBar progress={1} height={6} />
      </Section>

      <Section title="SURFACES">
        <Surface
          fill={gradients.heroSurfaceToday.colors}
          gradientLocations={gradients.heroSurfaceToday.stops}
          cornerRadius={32}
          padding={20}
          texture="heroCard"
          bloom={<Bloom color={colors.accent.violet} size={300} opacity={0.55} x={175} y={0} />}>
          <AppText variant="cardTitle">Hero surface</AppText>
          <AppText variant="metadata" tone="muted">
            블룸 하나 + 13px 질감
          </AppText>
        </Surface>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['violet', 'cyan', 'pink'] as const).map((key) => (
            <Surface
              key={key}
              fill={colors.groupAccent[key].surface}
              style={{ flex: 1, height: 124, justifyContent: 'space-between' }}
              bloom={
                <Bloom color={colors.groupAccent[key].bloom} size={220} opacity={0.45} x={40} y={20} />
              }>
              <AvatarStack members={MEMBERS.slice(0, 3)} surfaceColor={colors.groupAccent[key].surface} />
              <View>
                <AppText variant="cardNumber">3h 42m</AppText>
                <AppText variant="metadata" tone="muted">
                  {key}
                </AppText>
              </View>
            </Surface>
          ))}
        </View>

        <Surface onPress={() => {}}>
          <AppText variant="cardTitle">눌러보기 — scale 0.985</AppText>
        </Surface>
      </Section>

      <Section title="EMPTY">
        <EmptyState
          title="아직 그룹이 없어요"
          body="친구 한 명만 있으면 공동 시간을 시작할 수 있어요."
          action={<GradientButton label="그룹 만들기" size="md" onPress={() => {}} />}
        />
      </Section>
    </ScreenFrame>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10, marginTop: 18 }}>
      <AppText variant="eyebrow" tone="faint">
        {title}
      </AppText>
      {children}
    </View>
  );
}
