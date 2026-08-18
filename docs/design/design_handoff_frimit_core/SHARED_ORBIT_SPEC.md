# SHARED_ORBIT_SPEC

The Shared Orbit is Frimit's signature graphic. It says one thing: **a group of people is spending one finite pool of time together.** Get this right before anything else.

---

## 1. Visual structure

From outside in:

| Layer | Geometry | Meaning |
| --- | --- | --- |
| Dashed track circle | 1px dashed `rgba(255,255,255,0.10–0.12)` at the outer radius | The full day's shared pool, as a container |
| Progress arc | Stroke ring, starts at −90° (12 o'clock), runs clockwise | Time already spent by the group |
| Member segments | The progress arc cut into one arc per member, separated by a 2° gap in `rgba(0,0,0,0.55)` | Who spent it (Group Detail only) |
| Remaining segment | The rest of the ring in `rgba(255,255,255,0.055)` | Time the group still has |
| Arc glow | A blurred duplicate of the arc, 0.80–0.90 opacity | Makes the ring feel lit rather than drawn |
| Avatars | Discs centered **on** the stroke radius | The people sharing the pool |
| Center content | Remaining time (Today) or used time (Group Detail) | The number the user came for |
| Inner bloom | Radial gradient, breathing 6–7s | Ambient depth, not information |

Geometry constants (from the approved designs):

```
Today hero:        size 162, stroke ratio 0.18 → stroke ≈ 14.6, avatar 32 on radius 73.7
Group Detail:      box 158, ring inset 18 → size 122, stroke ratio 0.26 → stroke ≈ 16, avatar 28 on radius 79
Celebration/large: size 250–300, stroke ratio 0.14, avatar 36–40 on radius (size/2) − 10
```

Avatar radius rule: **every avatar center sits at exactly the same radius** — `r_avatar = (size - stroke) / 2` for a ring-hugging placement, or the outer dashed radius for the "seats around the table" placement used in the larger orbits. Never position avatars with ad-hoc top/left offsets.

---

## 2. Meaning

- The ring is the **group's** day, not the user's. The user's own share is one segment among several.
- Filling clockwise from 12 o'clock reads as a clock, which is the intended association.
- Color is state, not decoration: cyan-led = plenty left, violet-led = tightening, magenta = nearly gone, pink outer arc = over.
- An empty seat (dashed avatar) means an invited member who has not joined or is not ready. It is an invitation, never a shaming device.

---

## 3. Usage calculation

```ts
const limitMinutes     = 480;                      // 8h shared
const usedMinutes      = members.reduce((s, m) => s + m.usedMinutes, 0);
const remainingMinutes = Math.max(0, limitMinutes - usedMinutes);
const overMinutes      = Math.max(0, usedMinutes - limitMinutes);
const progress         = Math.min(1, usedMinutes / limitMinutes);   // arc sweep
const overshoot        = Math.min(1, overMinutes / limitMinutes);   // outer arc, capped at 60°
```

Segment sweeps (Group Detail):

```ts
const sweeps = members.map(m => (m.usedMinutes / limitMinutes) * 360);   // degrees, in rank order
// separator: 2° subtracted from the end of each segment, filled with the card surface color
```

Labels: remaining is formatted `Xh YYm`, dropping the hour part below 60 minutes (`48m`), and rendered as `Xm over` when over. Percentages round to the nearest integer and are prefixed `~` when any member's data is stale.

---

## 4. Avatar positioning

Angles are computed, never hard-coded per member count. Start at −90° and distribute evenly:

```ts
function avatarAngles(count: number): number[] {
  // even distribution starting at 12 o'clock, clockwise
  return Array.from({ length: count }, (_, i) => -90 + (360 / count) * i);
}

function avatarPosition(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}
```

Per member count:

| Members | Angles | Avatar size (Today / Detail) | Notes |
| --- | --- | --- | --- |
| 2 | −90°, 90° | 34 / 30 | Top and bottom; the ring reads as split in half |
| 3 | −90°, 30°, 150° | 32 / 28 | Equilateral |
| 4 | −90°, 0°, 90°, 180° | 32 / 28 | The approved reference layout |
| 5–6 | even split | 28 / 26 | Reduce size one step |
| 7–8 | even split | 26 / 24 | Reduce size, drop the initial to 10px |
| 9+ | show the first 7 + a `+N` disc at the last angle | 26 / 24 | The `+N` disc uses `rgba(255,255,255,0.10)` |

Every avatar gets a 2px border in the card surface color so it cuts cleanly out of the arc. The current user's avatar is placed first (at −90°) and is the only one that may carry an activity ring in the hero.

---

## 5. React Native implementation

```tsx
import Svg, { Circle, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import Animated, { useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function SharedOrbitRing({ size, stroke, progress, gradient, members, children }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: withTiming(C * (1 - progress.value), {
      duration: 420,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0"   stopColor={gradient[0]} />
            <Stop offset="0.62" stopColor={gradient[1]} />
            <Stop offset="1"   stopColor={gradient[2]} />
          </LinearGradient>
        </Defs>

        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {/* remaining */}
          <Circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.055)"
                  strokeWidth={stroke} fill="none" />
          {/* glow: same arc, wider and faint — replaces the CSS blur */}
          <AnimatedCircle cx={size/2} cy={size/2} r={r} stroke="url(#arc)"
                  strokeWidth={stroke * 1.9} strokeOpacity={0.18} strokeLinecap="round"
                  fill="none" strokeDasharray={C} animatedProps={animatedProps} />
          {/* progress */}
          <AnimatedCircle cx={size/2} cy={size/2} r={r} stroke="url(#arc)"
                  strokeWidth={stroke} strokeLinecap="round" fill="none"
                  strokeDasharray={C} animatedProps={animatedProps} />
        </G>
      </Svg>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">{children}</View>

      {members.map((m, i) => {
        const { x, y } = avatarPosition(avatarAngles(members.length)[i], r);
        return (
          <Avatar key={m.id} member={m} size="xxs"
            style={{ position: 'absolute', left: size/2 + x - 14, top: size/2 + y - 14 }} />
        );
      })}
    </View>
  );
}
```

**Segmented variant.** Render one `<Circle>` per member with
`strokeDasharray={[arcLength - gap, C - arcLength + gap]}` and
`strokeDashoffset={-offsetForThisMember}`, `strokeLinecap="butt"`. Accumulate offsets in rank order.

**Overshoot arc (state F).** A second `<Svg>` at `size * 1.11` with `stroke = size * 0.045`, pink gradient, sweep capped at 60°.

**Component tree.**

```
SharedPoolHero
 ├ BloomLayer (Svg RadialGradient, absolute, pointerEvents none)
 ├ DotTexture (ImageBackground, 13px tile)
 ├ Row
 │   ├ StatusPill (group)
 │   └ NumericLabel ("54% USED")
 ├ SharedOrbitRing
 │   ├ Svg [track · glow arc · progress arc | segments]
 │   ├ CenterContent (remaining number + sublabel)
 │   └ Avatar × n (absolute, computed angles)
 └ FooterRow (sync label · member highlight)
```

**Do not.** Use a conic gradient polyfill, animate `strokeDasharray`, re-mount the `Svg` on value change, or place avatars inside the `Svg` (they need real touch targets and image loading).

---

## 6. Reuse beyond the core screens

The same component, different props: Today hero (continuous), Group Detail (segmented), widget (size 120, no avatars), goal completion (full ring, achievement gradient), loading (track only with a 20° arc rotating at 1.2s linear). Keep one implementation.
