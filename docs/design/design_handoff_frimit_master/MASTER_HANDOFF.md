# Frimit Design V1 — Master Handoff

This is the **entry point** for implementing Frimit Design V1. It contains no specifications of its own: it explains how the package is organised, which document answers which question, and in what order to build. Detailed specs stay where they are, in the two handoff folders.

```text
design_handoff_frimit_master/        ← you are here (index · roadmap · final QA)
design_handoff_frimit_core/         ← Core app specification
design_handoff_frimit_onboarding/   ← Onboarding specification
```

Do not edit files in the two handoff folders while implementing. They are the approved record.

---

## Product design structure

### Core App — `design_handoff_frimit_core/`

The running product: everything a user sees after their group's pool is live.

Scope: Today · Goals · Activity · MY · Group Detail · the eight Today states · the Shared Orbit signature graphic · the design system (tokens, gradients, glow recipes, type, spacing, radius) · motion · React Native implementation notes · asset manifest · build order · QA.

Files: `README.md`, `DESIGN_TOKENS.ts`, `COMPONENT_SPEC.md`, `MAIN_SCREEN_SPEC.md`, `TODAY_STATE_SPEC.md`, `SHARED_ORBIT_SPEC.md`, `MOTION_SPEC.md`, `RN_IMPLEMENTATION_NOTES.md`, `ASSET_MANIFEST.md`, `CORE_IMPLEMENTATION_ORDER.md`, `CORE_QA_CHECKLIST.md`, `design_files/`.

### Onboarding — `design_handoff_frimit_onboarding/`

First launch through the first live shared pool.

Scope: Welcome · Sign In · Profile Setup · Notification permission intro · Screen Time privacy intro · Screen Time permission (plus approved / denied return states) · Create or Join · Invitation Preview · Group Setup · Invite Friends · Tracking app selection intro · App selection result · Member Readiness · Waiting Room · Group Started · Permission Recovery.

Files: `README.md`, `ONBOARDING_SCREEN_SPEC.md`, `ONBOARDING_NAVIGATION.md`, `PERMISSION_FLOW_SPEC.md`, `ONBOARDING_MOTION_SPEC.md`, `ONBOARDING_COMPONENT_SPEC.md`, `ONBOARDING_IMPLEMENTATION_ORDER.md`, `ONBOARDING_QA_CHECKLIST.md`, `design_files/`.

**Dependency direction is one-way.** Onboarding consumes the Core design system and never redefines a token or a shared component. If something is needed in both places, it belongs to Core.

---

## Source of truth priority

When two documents disagree:

1. **The approved original design HTML** in either `design_files/` folder.
2. **Design system / design tokens** — `design_handoff_frimit_core/DESIGN_TOKENS.ts` and the Design System page.
3. **Screen specifications** — `MAIN_SCREEN_SPEC.md`, `TODAY_STATE_SPEC.md`, `ONBOARDING_SCREEN_SPEC.md`.
4. **Component specifications** — `COMPONENT_SPEC.md`, `ONBOARDING_COMPONENT_SPEC.md`.
5. **Implementation notes** — `RN_IMPLEMENTATION_NOTES.md`, motion specs, asset manifest.

A screen-specific exception in the original design wins over a general rule. Example: onboarding's 26px horizontal padding is intentional even though the core screens use 20 — the screen's own design file is the authority.

---

## Core product hierarchy

Every screen answers these in this order:

1. **Our shared time** — the group's remaining pool for today.
2. **My usage / my personal limit** — present, but never louder than the pool.
3. **Member ranking** — friendly, positive-only comparison.

Frimit is not a personal tracker with group features. It is a shared-time product that contains personal data.

### Visual identity

- **Shared Orbit** — one ring, segmented by member, filling clockwise from 12 o'clock.
- **Almost-black surfaces** — #050507 base; black is 80%+ of every screen.
- **Violet / blue / cyan ambient lighting** — color used as light (arc, bloom, dot, bar), never as large fill.
- **Group accent identity** — violet / cyan / pink, carried across every screen a group appears on.
- **Avatar-based social presence** — people are visible on the gauge, not in a list beside it.
- **Large numeric typography** — the number is the headline.
- **Restrained glow and glass** — max two bloom layers per screen; glass on pills only.
- **Dark Social Space** — the overall mood: a quiet digital room shared with friends at night.

---

## File reading guide

Read on demand. Nothing here requires reading the whole package up front.

**Starting the project**
- `design_handoff_frimit_core/README.md`
- `design_handoff_frimit_core/DESIGN_TOKENS.ts`
- `design_handoff_frimit_core/COMPONENT_SPEC.md`
- `MASTER_IMPLEMENTATION_ORDER.md` (this folder)

**Building primitives and the app shell**
- add `RN_IMPLEMENTATION_NOTES.md`, `ASSET_MANIFEST.md`

**Building the Shared Orbit**
- add `SHARED_ORBIT_SPEC.md` (read it fully before writing any arc code)

**Building Today**
- add `MAIN_SCREEN_SPEC.md` §1, `TODAY_STATE_SPEC.md`, `SHARED_ORBIT_SPEC.md`

**Building Group Detail**
- add `MAIN_SCREEN_SPEC.md` §5, `COMPONENT_SPEC.md` §6–9

**Building Goals / Activity / MY**
- add `MAIN_SCREEN_SPEC.md` §2–4

**Building onboarding**
- add `design_handoff_frimit_onboarding/README.md`, `ONBOARDING_SCREEN_SPEC.md`, `ONBOARDING_NAVIGATION.md`, `ONBOARDING_COMPONENT_SPEC.md`

**Wiring permissions or the app picker**
- add `PERMISSION_FLOW_SPEC.md`

**Animation work**
- `design_handoff_frimit_core/MOTION_SPEC.md` for the running app
- `design_handoff_frimit_onboarding/ONBOARDING_MOTION_SPEC.md` for the orbit narrative and the Group Started → Today morph

**Visual QA**
- `MASTER_QA_CHECKLIST.md` first, then `CORE_QA_CHECKLIST.md` / `ONBOARDING_QA_CHECKLIST.md` for depth, always side by side with the HTML in `design_files/`

---

## System UI boundary

Frimit does not design, restyle, or reproduce:

- the OS notification permission sheet
- the Screen Time / Family Controls authorization sheet
- iOS `FamilyActivityPicker`
- Android usage-access and other platform settings screens
- the OS share sheet

Frimit owns only:

```
[ before state ]  →  [ system UI ]  →  [ return state ]
```

Never build a mock system sheet, even for demos or screenshots. Details and per-platform behavior: `design_handoff_frimit_onboarding/PERMISSION_FLOW_SPEC.md`.

---

## Implementation principle

**Visual fidelity + maintainable React Native implementation.**

Match the design exactly where it carries Frimit's identity. Where a purely decorative effect would cost frames — a live blur inside a scrolling list, a third bloom layer — use the cheaper technique documented in `RN_IMPLEMENTATION_NOTES.md`. Never reshape hierarchy or layout for implementation convenience, and never sacrifice performance for decoration.

Fidelity priority, highest first:

1. Shared Orbit
2. Typography hierarchy
3. Surface hierarchy
4. Ambient accent lighting
5. Avatar placement
6. Group accent identity
7. Bottom navigation selected state

If a trade-off is unavoidable, protect the item higher on this list.
