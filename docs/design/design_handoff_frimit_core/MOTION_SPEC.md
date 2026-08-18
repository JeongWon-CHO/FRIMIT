# MOTION_SPEC

Reanimated only. No layout animations on lists, no spring chains, no confetti. If an animation cannot be expressed as opacity / transform / `strokeDashoffset` / interpolated color, it is out of scope.

Tokens: `motion.duration.{fast 120, normal 240, slow 420, stateChange 600, orbit 900}`, `motion.easing.standard = Easing.bezier(0.22, 1, 0.36, 1)`, `motion.easing.press = Easing.bezier(0.4, 0, 0.2, 1)`.

---

## 1. Shared Pool usage update

**Trigger.** A sync returns a new `usedMinutes` (poll, app foreground, or pull-to-refresh).

| Property | From → To | Duration | Easing |
| --- | --- | --- | --- |
| `strokeDashoffset` (progress arc) | old sweep → new sweep | `slow` (420) | standard |
| `strokeDashoffset` (glow arc) | same, 60ms delay | 420 | standard |
| Hero number | counts old → new minutes | 420 | linear, 1 frame per 16ms, formatted each frame |
| Chip percentage | counts old → new | 420 | linear |
| Footer sync label | crossfade opacity 1 → 0 → 1 | 2 × 120 | standard |

Number counting: drive a shared value and format on the UI thread with a `useDerivedValue` + `ReText`, or `runOnJS` a throttled setState at 30fps. Never animate a `<Text>` remount per frame.

## 2. Today state transition

**Trigger.** `poolState()` returns a different state (crossing 70% / 88% / 100%, over, permission grant, stale flag).

| Property | Change | Duration | Easing |
| --- | --- | --- | --- |
| Arc gradient stops | interpolateColor per stop | `stateChange` (600) | standard |
| Hero surface gradient | interpolateColor, 2 stops | 600 | standard |
| Bloom color + opacity | interpolateColor + opacity | 600 | standard |
| Bloom position | translateY, e.g. −110 → −90 (C), → +110 (E) | 600 | standard |
| Pill tone (fill, border, text) | interpolateColor | 600 | standard |
| Chip label | crossfade | 2 × 120 | standard |
| Dot texture opacity (E, H) | 0.075 → 0.045 | 600 | standard |

State D adds a looping bloom pulse: `opacity 0.55 ↔ 1`, `scale 1 ↔ 1.06`, 4500ms, `Easing.inOut(Easing.sin)`, `withRepeat(-1, true)`. States B and E use 6000/7000ms versions of the same loop. Only one looping animation is allowed on screen; cancel it on blur.

Permission grant (H → live): grey track fades out (240) while the arc draws from 0 to its value over `orbit` (900) and the bloom fades in (600). The `— —` placeholder crossfades to the number.

## 3. Bottom navigation

**Trigger.** Tab press.

- Pill: `opacity 0 → 1` and `scale 0.92 → 1`, `normal` (240), standard.
- Outgoing pill: `opacity → 0`, 160.
- Icon color: interpolateColor over 240.
- Nav glow (shadowOpacity 0 → 0.35): 240. On Android use a static bloom image behind the pill instead of `elevation`.
- Screen content: `opacity 0 → 1` + `translateY 12 → 0`, 240. No horizontal slide between tabs.

## 4. Card press

**Trigger.** `onPressIn` / `onPressOut` on `GroupCard`, `MemberCard`, `ActivityItem`, `RankingItem`, buttons.

- `scale 1 → 0.985`, `fast` (120), `press` easing; back to 1 over 160.
- An overlay `rgba(255,255,255,0.04)` fades in over 120 — this is the "surface sinks" read; do not change elevation.
- Buttons additionally drop `shadowOpacity` 0.7 → 0.45 over 120.
- Use `Pressable` with `unstable_pressDelay: 0`; keep hit slop ≥ 8.

## 5. Ranking change

**Trigger.** A sync reorders the ranking list.

- Rows animate with `Layout.duration(300).easing(standard)` (Reanimated layout animations are acceptable here — the list is ≤ 8 rows and off the hot path).
- The moved row's surface flashes `rgba(255,255,255,0.06) → transparent` over 400.
- Usage numbers count to their new value over `slow` (420).
- Rank numerals crossfade (2 × 120). Never animate a row's color to red on a drop.

## 6. Rank #1 achievement

**Trigger.** A member becomes rank 1 (including on first load, once per session).

- Achievement ring: `opacity 0 → 0.75` over 300, `scale 0.9 → 1` over 300, standard.
- Crown: `scale 0 → 1.15 → 1`, 380 total, standard. `translateY −4 → 0`.
- Card bloom: `opacity 0.3 → 0.5 → 0.45`, 600.
- No sound, no haptic beyond `Haptics.impactAsync(Light)` on the transition.

## 7. Stale sync indicator

**Trigger.** A member's data ages past 30 minutes.

- Dashed amber circle: `opacity 0 → 1` over `normal`; the dash pattern rotates 360° over 12s linear, `withRepeat(-1)` — this is the one continuous rotation in the app and it is slow enough to read as "waiting", not "loading".
- Amber dot: gentle `opacity 0.55 ↔ 1` at 2400ms.
- Sync row (state G): enters with `height 0 → 56` + `opacity 0 → 1`, 300, standard.
- On recovery: everything fades out over 240 and the gauge sublabel crossfades back.

## 8. Goal progress update

**Trigger.** A member logs progress.

- Bar fill width: `slow` (420), standard, animated via `scaleX` on a full-width fill (cheaper than width) with `transformOrigin` left.
- Tip dot: follows via `translateX`, same timing; `scale 1 → 1.25 → 1` over 300 on arrival.
- Percentage: counts over 420.
- Member row bar: 300, standard, staggered 60ms after the group bar.

**Optional — Group Detail hero collapse on scroll.** `scrollY 0 → 120` maps the orbit to `scale 1 → 0.82` and the hero padding to `18 → 12`, driven by `useAnimatedScrollHandler`. Interpolate only; no snap points.

---

## Global rules

- Respect `AccessibilityInfo.isReduceMotionEnabled()`: disable all looping pulses and the dashed rotation, shorten counting animations to a direct set, keep crossfades.
- Cancel every loop in `useFocusEffect` cleanup.
- Never animate `blurRadius`, shadow radius, or gradient stop positions (only their colors).
- Target 60fps on a mid-range Android device with the Today screen mounted; if the arc glow duplicate costs frames, drop it before dropping the arc.
