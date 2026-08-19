import { View } from 'react-native';

import { OrbitSeats, SharedOrbitRing, type Seat } from '@/components/orbit';
import { AppText, ScreenFrame } from '@/components/ui';
import { gradients } from '@/constants/design-tokens';
import { POOL_VISUALS } from '@/lib/pool-state';

/**
 * 오빗 실험대 — 개발 전용.
 *
 * Today를 만들기 전에 여기가 먼저 통과해야 한다(MASTER_IMPLEMENTATION_ORDER의
 * Phase 3 게이트). 눈으로 잴 것 넷:
 *   1. 마주 보는 두 아바타의 반지름이 같은가
 *   2. 아크가 12시에서 시작하는가
 *   3. 스트로크가 바깥 반지름의 18%인가
 *   4. 발광 겹이 아크 끝을 두 번 그리지 않는가
 */
const NAMES = ['정원', '민지', '도형', '수민', '하늘', '지우', '서준', '나은', '태호'];
const EMOJI = ['🐣', '🦊', '🐧', '🐢', '🦉', '🐙', '🦔', '🐝', '🐣'];

function seatsFor(count: number): Seat[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `member-${index}-${count}`,
    name: NAMES[index % NAMES.length],
    emoji: EMOJI[index % EMOJI.length],
    ring: index === 0 ? ('activity' as const) : ('none' as const),
  }));
}

export default function OrbitDemoScreen() {
  return (
    <ScreenFrame bottomInset={40}>
      <AppText variant="screenTitle">Shared Orbit</AppText>

      <Group title="SIZES · continuous 54%">
        {[122, 158, 162, 190, 250, 300].map((size) => (
          <View key={size} style={{ alignItems: 'center', gap: 6 }}>
            <SharedOrbitRing size={size} progress={0.54} gradient={gradients.sharedPool.colors} showTrackDashes>
              <AppText variant="heroNumberSm">3h 42m</AppText>
            </SharedOrbitRing>
            <AppText variant="numericLabel" tone="faint">
              {size}
            </AppText>
          </View>
        ))}
      </Group>

      <Group title="MEMBERS 2–9 · 반지름이 전부 같아야 한다">
        {[2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
          <View key={count} style={{ alignItems: 'center', gap: 6 }}>
            <View>
              <SharedOrbitRing size={162} progress={0.54} gradient={gradients.sharedPool.colors} showTrackDashes />
              <OrbitSeats seats={seatsFor(count)} size={162} />
            </View>
            <AppText variant="numericLabel" tone="faint">
              {count}명
            </AppText>
          </View>
        ))}
      </Group>

      <Group title="VARIANTS">
        <Labelled label="segmented">
          <SharedOrbitRing
            size={158}
            progress={0.62}
            variant="segmented"
            gradient={gradients.sharedPool.colors}
            segmentValues={[5400, 3600, 1800, 900]}
            segmentLimit={19200}
            strokeRatio={0.26}
          />
        </Labelled>

        <Labelled label="complete">
          <SharedOrbitRing size={158} progress={1} variant="complete" gradient={POOL_VISUALS.complete.arc} />
        </Labelled>

        <Labelled label="overshoot 108%">
          <SharedOrbitRing
            size={158}
            progress={1}
            variant="overshoot"
            gradient={POOL_VISUALS.over.arc}
            overSeconds={2520}
            limitSeconds={28800}
          />
        </Labelled>

        <Labelled label="empty">
          <SharedOrbitRing size={158} progress={0} variant="empty" gradient={POOL_VISUALS.permissionOff.arc} showTrackDashes />
        </Labelled>

        <Labelled label="stale sync">
          <SharedOrbitRing size={158} progress={0.54} gradient={gradients.sharedPool.colors} staleRing />
        </Labelled>

        <Labelled label="pending seats">
          <View>
            <SharedOrbitRing size={158} progress={0.25} gradient={gradients.sharedPool.colors} showTrackDashes />
            <OrbitSeats
              seats={[
                { id: 'me', name: '정원', emoji: '🐣', ring: 'activity' },
                { id: 'p1', name: '민', pending: true },
                { id: 'p2', name: '도', pending: true },
                { id: 'p3', name: '수', pending: true },
              ]}
              size={158}
            />
          </View>
        </Labelled>
      </Group>

      <Group title="STATES · 8상태의 아크">
        {(Object.keys(POOL_VISUALS) as (keyof typeof POOL_VISUALS)[]).map((state) => (
          <Labelled key={state} label={state}>
            <SharedOrbitRing
              size={122}
              progress={
                state === 'fresh' ? 0.02 : state === 'complete' || state === 'over' ? 1 : 0.54
              }
              variant={state === 'complete' ? 'complete' : state === 'permissionOff' ? 'empty' : 'continuous'}
              gradient={POOL_VISUALS[state].arc}
              glow={state === 'permissionOff' ? 'none' : 'soft'}
            />
          </Labelled>
        ))}
      </Group>
    </ScreenFrame>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 14, marginTop: 20 }}>
      <AppText variant="eyebrow" tone="faint">
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
        {children}
      </View>
    </View>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {children}
      <AppText variant="numericLabel" tone="faint">
        {label}
      </AppText>
    </View>
  );
}
