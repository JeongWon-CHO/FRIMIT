# RN_IMPLEMENTATION_NOTES

Baseline: Expo SDK with `react-native-svg`, `expo-linear-gradient`, `react-native-reanimated`, `react-native-safe-area-context`. `expo-blur` is optional and restricted to pills; the design does not require it.

---

## Gradient

Use `expo-linear-gradient` for every flat gradient surface:

| Where | Colors | start / end |
| --- | --- | --- |
| Primary button, toggle | `gradients.violetToBlue` | `{x:0,y:0} → {x:1,y:0.18}` |
| Progress bar fills | `gradients.sharedPool` | `{x:0,y:0} → {x:1,y:0}` |
| Hero card surface | `gradients.heroSurfaceToday` (locations `[0,0.55,1]`) | `{x:0.1,y:0} → {x:0.9,y:1}` (≈165°) |
| Avatar fill | `gradients.avatarFills[i]` | `{x:0,y:0} → {x:1,y:1}` (≈150°) |
| Bottom-nav scrim | `gradients.navScrim` | `{x:0,y:1} → {x:0,y:0}` |
| Highlighted member card | `['#161029','#0B0B12']` | 150° |

Angle conversion: a CSS `Ndeg` maps to start/end points on the unit square; for the two angles used (150°, 165°) the values in the table are close enough and were checked against the mocks.

**Conic gradients do not exist.** Everywhere the design uses one (orbit arc, avatar ring, achievement ring), either render an SVG arc with a `LinearGradient` stroke (orbit — see `SHARED_ORBIT_SPEC`) or ship a small PNG ring (avatar rings — see `ASSET_MANIFEST`).

## Shared Orbit

Full implementation in `SHARED_ORBIT_SPEC.md`. Summary: one `<Svg>`, `<Circle>` track, an optional wide low-opacity arc for the glow, the progress arc, `strokeDasharray = circumference`, animate `strokeDashoffset`. Avatars are RN `<View>`s positioned from computed angles, outside the SVG.

## Glow without runtime blur

The mocks use CSS `filter: blur()`. In RN, reproduce each glow with the cheapest of these three, in order:

1. **SVG RadialGradient bloom** — an absolutely-positioned `<Svg>` with a single `<RadialGradient>` from `rgba(accent, a)` at offset 0 to `rgba(accent, 0)` at offset 0.7, sized 1.4–1.8× the card. This covers hero blooms, card blooms and screen ambience. `pointerEvents="none"`, rendered first in the stack.
2. **Static bloom PNG** — for the few blooms that repeat inside a list (group cards). One 2× PNG per accent, tinted at build time, `resizeMode="stretch"`, opacity from `tokens.opacity`. Cheaper than three live gradients in a scrolling grid.
3. **Native shadow** — only for the selected nav pill and primary buttons: `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset {0,0}` on iOS. Android ignores colored shadows: use a static bloom PNG behind the pill instead of `elevation` (elevation renders a grey box shadow that reads wrong on black).

Never stack more than two blurred/bloom layers per screen, and never place one inside a `FlatList` row.

## Dot texture

Three tiles, per `dotTexture` in the tokens. Implement as `ImageBackground` with `resizeMode="repeat"`:

```tsx
<ImageBackground
  source={require('../assets/dot-17.png')}
  resizeMode="repeat"
  style={StyleSheet.absoluteFill}
  imageStyle={{ opacity: 1 }}   // opacity is baked into the PNG
  pointerEvents="none"
/>
```

Bake the dot color and alpha into the PNG (white dot at the specified alpha on transparent). Do not draw the grid with hundreds of `<View>`s, and do not use an SVG `<Pattern>` full-screen. Secondary surfaces (list rows, small cards) carry no texture.

## Glass

Restricted to `StatusPill`, the bottom-nav pill, and floating controls. An opaque `rgba(255,255,255,0.07)` fill with a hairline border is visually equivalent against the near-black background and is the default. Use `BlurView intensity={20}` only if a pill overlaps a bloom and banding is visible.

## Typography

- Load Manrope (400/500/600/700/800) and JetBrains Mono (400/500) via `expo-font` / `useFonts`, or `@expo-google-fonts/manrope` + `@expo-google-fonts/jetbrains-mono`.
- Fallback: `System` (SF Pro on iOS, Roboto on Android). Weight 800 exists in both; if only 700 is available the hierarchy still holds — do not compensate with size.
- RN `letterSpacing` is in px, not em. The token file already converts.
- Set `allowFontScaling={false}` on hero numbers and gauge centers only (they are geometry-bound); everything else scales.
- Korean text: Manrope has no Hangul. Set a font stack so Hangul falls back to the system Korean face (iOS Apple SD Gothic Neo, Android Noto Sans KR) — in practice, render Korean strings without an explicit `fontFamily` and keep weights. Verify that mixed strings ("민지 · 1h 04m") do not shift baselines; if they do, split into two `<Text>` children in a row.
- Tabular figures for counting numbers: `fontVariant: ['tabular-nums']` on the hero number and all usage values, so widths don't jitter mid-animation.

## Safe area

`SafeAreaProvider` at the root; screens use `useSafeAreaInsets()`.

- Top: content `paddingTop = insets.top + 10` (the mocks' 64 assumes a 54px status bar).
- Bottom: nav height = `104 + insets.bottom`, its content stays pinned to the top 104. Screen scroll content keeps `paddingBottom = 108 + insets.bottom`.
- Group Detail (no nav): `paddingBottom = 24 + insets.bottom`.

## Bottom navigation

Custom tab bar (`tabBar={props => <BottomNavigation {...props} />}`) with `tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0 }`. The scrim gradient belongs to the component, not the navigator. Set `sceneContainerStyle={{ backgroundColor: '#050507' }}` so tab transitions never flash white.

## Android / iOS differences

- Colored shadows: iOS only. Android → static bloom PNG.
- `overflow: 'hidden'` with a large `borderRadius` on Android clips gradients inconsistently; put the radius on the container and let children inherit via a wrapping `<View>` with the same radius.
- Elevation adds an unwanted grey shadow on dark surfaces — set `elevation: 0` explicitly on cards.
- `react-native-svg` text rendering differs slightly; keep all text in RN `<Text>`, never in SVG.
- Android renders 1px hairlines heavier; use `StyleSheet.hairlineWidth` only where a border should disappear, otherwise keep a literal 1.
- Font weight 800 falls back to 700 on some Android builds — acceptable, do not swap fonts.

## Performance

- The Today grid renders at most 4 bloom layers. If a user has many groups, virtualize the grid and use the static bloom PNG variant.
- Never mount an `<Svg>` per list row. `RankingItem`, `ActivityItem` and `GroupCard` use no SVG — bars are plain `<View>`s with `LinearGradient`.
- Memoize `GroupCard`, `RankingItem`, `ActivityItem` with `React.memo`; keep member arrays referentially stable between syncs.
- Reanimated shared values for the gauge; do not `setState` per frame.
- Cancel looping animations on screen blur (`useFocusEffect`), otherwise three screens pulse in the background.
- Target: Today mounts under 400ms on a mid-range Android, 60fps while scrolling Activity with 100 items.
