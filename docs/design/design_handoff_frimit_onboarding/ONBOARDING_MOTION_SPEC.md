# ONBOARDING_MOTION_SPEC

Extends `design_handoff_frimit_core/MOTION_SPEC.md`; the same tokens apply (`fast 120 / normal 240 / slow 420 / stateChange 600 / orbit 900`, `standard = Easing.bezier(0.22, 1, 0.36, 1)`, `press = Easing.bezier(0.4, 0, 0.2, 1)`). Reanimated only. Everything below is opacity, transform, `strokeDashoffset` or interpolated color.

---

## 0. The orbit narrative

One `SharedOrbitRing` instance conceptually persists across the flow. Each stage adds exactly one idea.

```
01 Welcome        one bright light + three dim lights, ring nearly full, nothing "owned"
07 Create card    a 64px mini-orbit: me at the center, three dashed seats
08 Invitation     three filled seats + one dashed seat — mine
10 Invite friends me filled, three dashed seats, arc at 1/4
14 Waiting room   seats fill one by one as friends become ready
15 Group started  all seats glowing, arc at the day's real value
Today             the orbit shrinks into the Shared Pool hero
```

## 1. Screen transitions (all onboarding routes)

- Enter: `opacity 0 → 1` over `normal` (240) + `translateY 12 → 0`, standard.
- Exit: `opacity 1 → 0` over 160. No horizontal slide, no card stack shadow.
- Stack option: `animation: 'fade'` with `animationDuration: 240`; disable the default iOS slide so the flow reads as one continuous space.
- The orbit on consecutive orbit-bearing screens (08 → 14 → 15) uses `sharedTransitionTag="orbit"` when available; otherwise it re-enters with `scale 0.94 → 1` over 300, which reads close enough.

## 2. Welcome and profile

**Welcome orbit intro.** On mount: arc draws from 0 to its resting sweep via `strokeDashoffset` over `orbit` (900), standard. The bright 12 o'clock light fades in at 200ms (`opacity 0 → 1`, 300, `scale 0.6 → 1`). The three dim lights fade in staggered 80ms apart from 500ms. Total ≈ 1.1s, then still.

**Welcome ambient.** The screen bloom breathes `opacity 0.55 ↔ 1`, `scale 1 ↔ 1.06`, 8000ms, `inOutSine`, `withRepeat(-1, true)`. Only one loop on screen.

**Profile avatar select.** Tapping a preset: preview `scale 1 → 0.92 → 1` over 320 (standard), the new gradient crossfades over 200, and the conic ring re-enters `opacity 0 → 0.7` over 240. Selected swatch: `opacity 0.55 → 1` and a border color interpolation over `fast`.

**Nickname focus.** Field border `rgba(255,255,255,0.10) → rgba(167,139,250,0.30)` and glow opacity `0 → 1` over `normal`. Caret uses the platform default; do not animate it.

## 3. Empty seats appear (07, 10)

A dashed seat is a distinct visual event, not a placeholder that was always there.

- On mount, seats enter staggered 90ms apart: `opacity 0 → 1` (240), `scale 0.7 → 1` (280, standard).
- The dashed border does not rotate here (that pattern is reserved for stale sync in the core app).
- Seats breathe together, very slightly: `opacity 0.85 ↔ 1`, 3200ms, `inOutSine`. Skip the loop when reduce-motion is on.

## 4. A friend joins (08 Join, 10 realtime, 13/14 readiness)

The signature moment. 620ms total, one seat at a time.

| Step | Property | From → To | Duration | Easing | Delay |
| --- | --- | --- | --- | --- | --- |
| 1 | Seat border | dashed → transparent | 160 | standard | 0 |
| 2 | Avatar fill | `opacity 0 → 1`, `scale 0.6 → 1.08 → 1` | 380 | standard | 60 |
| 3 | Seat glow | `shadowOpacity/bloom 0 → 0.7 → 0.45` | 420 | standard | 120 |
| 4 | Ring arc | extends by that member's share, `strokeDashoffset` | `slow` (420) | standard | 140 |
| 5 | Counter ("1 of 4 joined") | crossfade | 2 × 120 | standard | 300 |

When several friends join at once, stagger step 2 by 140ms per member; never run more than three at a time.

**Own join (08 → 11).** The user's own seat fills with the same sequence at 1.15× scale overshoot, plus a single `Haptics.impactAsync(Light)` at step 2. The screen then transitions after 700ms.

## 5. Waiting room

- **Member becomes ready.** Their dashed seat runs the §4 sequence; the status line counts up; the ready-count bar (screen 13) animates `scaleX` over `slow`.
- **Ambient.** The arc's blurred duplicate breathes at 7000ms, `inOutSine`. One loop only.
- **Start button enable.** When the second member becomes ready: `opacity 0.4 → 1` over 300 and `shadowOpacity 0 → 0.8` over 300. No bounce.
- **Member-side wait.** The "Waiting for 정원 to start" row pulses `opacity 0.7 ↔ 1` at 2600ms — slow enough to read as patience.

## 6. Group started, and the morph into Today

**On entering 15.**
1. Bloom expands: `scale 0.6 → 1`, `opacity 0 → 0.5`, 700ms, standard.
2. Arc draws 0 → full over `orbit` (900), standard, starting at 120ms.
3. Avatars pop in staggered 90ms: `scale 0.7 → 1`, `opacity 0 → 1`, 300 each.
4. Headline + caption: `opacity 0 → 1`, `translateY 10 → 0`, 300, at 700ms.
5. Bloom then settles into its 5000ms breathing loop.

**`See today` → Today hero morph** — the single most important transition in the app. 620ms total.

| Property | From (15) | To (Today hero) | Duration | Easing |
| --- | --- | --- | --- | --- |
| Orbit `scale` | 1 (300px) | 0.54 (→162px) | 620 | standard |
| Orbit `translateY` | centered | hero position (≈ −120) | 620 | standard |
| Orbit `rotate` | 0° | −8° then 0° (settle) | 620 | standard |
| Avatar radius | 150 | 73.7 | 620 | standard |
| Avatar size | 40 | 32 | 620 | standard |
| Center number | `8h 00m` 52px | `8h 00m` 36px | 620 | standard |
| Screen bloom | 560px @ 0.5 | 300px @ 0.4 | 620 | standard |
| Today chrome (header, section title, grid, nav) | `opacity 0`, `translateY 16` | `opacity 1`, `translateY 0` | 320, delayed 300 | standard |

Implementation: mount the Today screen underneath with its chrome at zero opacity, run the orbit as a shared element (`react-native-reanimated` shared transitions or a single absolutely-positioned overlay that both screens read from), then hand control to the Today hero's own shared values. Avatar radius and size are interpolated from one `progress` shared value — do not animate 4 × 2 separate values.

If shared transitions are unavailable on a platform, fall back to: 15 fades out over 200 while Today fades in with the hero orbit entering at `scale 0.9 → 1`. The narrative survives; do not ship a hard cut.

## 7. Permission transitions

**06 → 06a (granted).** Grey track fades out (240) while the arc draws 0 → full over `orbit`; the `✓` scales `0.6 → 1.1 → 1` over 380; the cyan bloom fades in over 600; auto-advance at 1600ms.

**06 → 06b (denied).** No motion beyond the standard screen transition. Denial is quiet.

**16 Recovery → live (grant while in-app).** The dashed self-seat runs the §4 join sequence, the grey track crossfades to the state gradient over `stateChange` (600), the arc draws to the real value over `slow`, and `— —` counts up to the live number over 420. The `EXPLORE WITHOUT PERMISSION` block collapses (`height → 0`, `opacity → 0`, 300) and the Today grid fades in behind it.

## 8. Buttons, cards, inputs

- Primary/secondary CTA press: `scale 1 → 0.985` over `fast`, `shadowOpacity 0.7 → 0.45`; release over 160.
- `ChoiceCard` (07): press `scale 0.985`, plus overlay `rgba(255,255,255,0.04)` at 120.
- `NumericTimeSelector`: on each step the number runs `scale 1 → 1.06 → 1` over 220 and counts; the range bar animates `scaleX` over 240. Long-press repeats every 150ms with no per-step bounce after the third repeat.
- `InviteCodeCard` copy: border color → `accent.cyan` over 160, hold 400, return over 300; caption crossfades.
- Invalid code (07): `translateX` keyframes `0 → −6 → 6 → −4 → 0` over 200, `press` easing, plus a border color interpolation to `state.overLimit`.

## 9. Global rules

- One looping animation per screen. Cancel on blur with `useFocusEffect`.
- Reduce motion: skip all loops, the orbit draw becomes an immediate set, the morph becomes a 200ms crossfade, join sequences collapse to a 240ms fade.
- Never animate blur radius, shadow radius or gradient stop positions.
- Every animation above runs on the UI thread; no `setState` per frame.
