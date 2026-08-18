# Handoff: Frimit Core UI

## Overview
Frimit is a social screen-time app. A group of friends shares **one daily time pool** (e.g. 4 friends share 8h) and everyone's usage draws down the same pool. This package specifies the **Core UI**: Today, Goals, Activity, MY, and Group Detail, plus the eight Today visual states and the Shared Orbit signature graphic.

Product hierarchy, in this order, on every screen: **Our shared time → My usage / my limit → Member ranking.**

## About the design files
The files in `design_files/` are **design references authored in HTML** — prototypes that show the intended look and behavior. They are not production code and should not be ported line by line. The task is to **recreate them in the target React Native / Expo codebase**, using its established patterns and the tokens in `DESIGN_TOKENS.ts`.

## Fidelity
**High fidelity.** Colors, typography, spacing, radii, glow and layout are final and approved. Recreate them exactly. Where a decoration would cost real performance (a repeated blur inside a list, for instance), follow `RN_IMPLEMENTATION_NOTES.md` — it gives an approved cheaper technique for every effect. Do not change visual hierarchy or layout for implementation convenience.

Fidelity priorities, highest first:
1. Shared Orbit (the signature gauge)
2. Black surface hierarchy — black is 80%+ of every screen
3. Violet / blue / cyan ambient lighting, used as light rather than as fill
4. Typography hierarchy — huge numbers first
5. Group accent identity
6. Avatar-based social presence
7. Selected bottom-navigation glow

## Source of truth
Conflicts resolve in this order:
1. `design_files/Frimit Design System.dc.html`
2. `design_files/Frimit.dc.html` (Today / Goals / Activity / MY)
3. `design_files/Frimit Group Detail.dc.html`
4. `design_files/Frimit Today States.dc.html`

Screen-specific exceptions follow that screen's file. **Frimit Onboarding is out of scope for this handoff** and is not included.

## Documents in this package

| File | What it covers |
| --- | --- |
| `DESIGN_TOKENS.ts` | Colors, group accents, gradients, typography, spacing, radius, borders, opacity, glow, motion, layout, dot texture. Drop into the RN project as-is. |
| `COMPONENT_SPEC.md` | 16 reusable components: purpose, props, variants, layout, typography, tokens, states, RN notes. |
| `MAIN_SCREEN_SPEC.md` | Today, Goals, Activity, MY, Group Detail: structure, exact layout numbers, data, interaction, navigation, empty/loading/error. |
| `TODAY_STATE_SPEC.md` | The eight Today states as visual variations of one layout. |
| `SHARED_ORBIT_SPEC.md` | The signature gauge: geometry, meaning, member math, avatar placement for 2–8 members, SVG implementation. |
| `MOTION_SPEC.md` | Every animation with trigger, duration, easing and animated property. Reanimated-only. |
| `RN_IMPLEMENTATION_NOTES.md` | Gradients, orbit, glow without runtime blur, dot texture, glass, fonts, safe area, platform differences, performance. |
| `ASSET_MANIFEST.md` | What is code-generated and the three static assets that are not. |
| `CORE_IMPLEMENTATION_ORDER.md` | Ten build phases with dependencies and completion criteria. |
| `CORE_QA_CHECKLIST.md` | Visual comparison checklist plus edge cases. |

## Tech baseline
React Native + Expo. `react-native-svg` for the orbit, rings and progress arcs. `expo-linear-gradient` for surfaces, buttons and bars. `react-native-reanimated` for motion. Blur dependencies are avoided — see the glow section of `RN_IMPLEMENTATION_NOTES.md`.

## Copy
All user-facing strings in the designs are final and bilingual by design (English for time/system labels, Korean for social copy). Do not rewrite them. Screen-by-screen copy is listed in `MAIN_SCREEN_SPEC.md` and `TODAY_STATE_SPEC.md`.

## Assets
No photographic assets. Avatars in the mocks are gradient discs with an initial; the production app should render a user photo when available and fall back to the same gradient + initial (`Avatar` in `COMPONENT_SPEC.md`). Three dot-texture tiles are the only static images — see `ASSET_MANIFEST.md`.

## Design files included
- `design_files/Frimit.dc.html` — Today, Goals, Activity, MY
- `design_files/Frimit Group Detail.dc.html` — Group Detail with ranking and personal limit
- `design_files/Frimit Today States.dc.html` — states A–H
- `design_files/Frimit Design System.dc.html` — tokens, recipes, component inventory

Open any file in a browser to inspect the reference rendering.
