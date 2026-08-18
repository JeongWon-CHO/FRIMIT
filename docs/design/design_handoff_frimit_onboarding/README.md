# Handoff: Frimit Onboarding & Group Setup

## Overview
Sixteen screens covering first launch through the first live Shared Time Pool. The narrative is **Alone → Invite → Together → Shared Time Starts**: one light in an empty orbit at Welcome, dashed empty seats while inviting, friends filling those seats, and finally four glowing avatars on a running pool that hands off to the Today screen.

## About the design file
`design_files/Frimit Onboarding.dc.html` is a **design reference authored in HTML** — a prototype of the intended look and behavior, not production code. Recreate it in the React Native / Expo app using the tokens and components already specified in the Core handoff.

## Fidelity
**High fidelity.** Colors, type, spacing, radii and glow are approved and final. This package specifies only; it introduces no new visual direction.

## Relationship to the Core handoff
This package is a **supplement to `design_handoff_frimit_core/`**, not a replacement.

- Tokens come from `design_handoff_frimit_core/DESIGN_TOKENS.ts`. No token is redefined here.
- Components already specified in `COMPONENT_SPEC.md` (Avatar, AvatarStack, StatusPill, SharedOrbitRing, ProgressBar, PermissionCTA, EmptyState, BottomNavigation, GradientButton) are **reused as-is**. `ONBOARDING_COMPONENT_SPEC.md` defines only what onboarding adds.
- Motion tokens come from `MOTION_SPEC.md`; `ONBOARDING_MOTION_SPEC.md` adds only the orbit narrative transitions.
- **Do not modify any file in `design_handoff_frimit_core/`.**

Where onboarding differs from the core screens, it does so deliberately and consistently:

| | Core screens | Onboarding |
| --- | --- | --- |
| Horizontal padding | 20 | **26** |
| Content top / bottom | 64 / 108 (nav) | **70 / 40** (no nav, except screen 16) |
| Dominant layout | scroll stack of cards | full-height column, `justify-content: space-between` |
| Orbit size | 158–162 | **250–300** (170 on the permission screen) |
| Bottom nav | always | only on screen 16 |

## Documents

| File | Covers |
| --- | --- |
| `ONBOARDING_SCREEN_SPEC.md` | All 16 screens (plus 06a/06b): purpose, layout numbers, components, copy, CTA, destination, states, safe area, scroll. |
| `ONBOARDING_NAVIGATION.md` | Every entry point and branch: create, join, invite link, denied, recovery, admin vs member. |
| `PERMISSION_FLOW_SPEC.md` | The boundary between Frimit screens and OS-owned UI, for notifications, Screen Time and the app picker. |
| `ONBOARDING_MOTION_SPEC.md` | The Shared Orbit narrative and every screen transition, Reanimated-level. |
| `ONBOARDING_COMPONENT_SPEC.md` | New components only: InviteCodeCard, CodeEntryField, PermissionExplanation, PrivacyDisclosureCard, ReadinessRow, NumericTimeSelector, AccentPicker, StepProgress, OrbitSeat, SelectionResult, ChoiceCard. |
| `ONBOARDING_IMPLEMENTATION_ORDER.md` | Seven build phases with dependencies and completion criteria. |
| `ONBOARDING_QA_CHECKLIST.md` | Visual checks plus onboarding-specific edge cases. |

## Copy
All strings in the design are final, bilingual by design (English for product/system labels, Korean for social and explanatory copy). Do not rewrite them. Exact copy per screen is in `ONBOARDING_SCREEN_SPEC.md`.

## System-owned UI
Frimit does not design the OS notification sheet, the Screen Time authorization sheet, or `FamilyActivityPicker`. It designs the screen before and the screen after. See `PERMISSION_FLOW_SPEC.md`.

## Files
- `design_files/Frimit Onboarding.dc.html` — the approved reference, all 16 screens plus the navigation map.
