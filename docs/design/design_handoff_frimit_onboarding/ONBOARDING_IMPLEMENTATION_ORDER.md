# ONBOARDING_IMPLEMENTATION_ORDER

Assumes the Core handoff is at least through its Phase 5 (tokens, primitives, navigation shell, Shared Orbit, cards). Onboarding cannot be built before `SharedOrbitRing` exists.

---

## Phase 1 — Onboarding shell

**Build.** `OnboardingStack` with fade transitions and the back/gesture rules from `ONBOARDING_NAVIGATION.md`; an `OnboardingScreen` layout wrapper (padding `insets.top + 16 / 26 / max(insets.bottom, 24) + 16`, `space-between`, dot texture, one optional bloom slot); `StepProgress`; the CTA button set (primary / secondary / tertiary); `onboardingStep` persistence and the resume rules.
**Dependencies.** Core Phases 1–2.
**Done when.** Sixteen placeholder routes navigate end to end with correct back behavior and survive a relaunch mid-flow.
**Check.** No white flash between routes; every screen's black background is continuous; CTA metrics match the reference (radius 18, padding 16, 16/800).

## Phase 2 — Linear screens (01–05)

**Build.** Welcome (with the light-only orbit), Sign in, Profile setup, Notification intro, Privacy intro. New components: `PermissionExplanation`, `PrivacyDisclosureCard`.
**Dependencies.** Phase 1, `Avatar`, `SharedOrbitRing`.
**Done when.** Each matches its section of the reference at 390×844 and degrades to a scroll on a small device.
**Check.** Welcome's headline is 38/800 over two lines; the "can't see" card is genuinely hard to read (0.22 opacity) and dashed; the Apple button carries no SF Symbols glyph.

## Phase 3 — Permission plumbing

**Build.** Screen 06 plus the 06a / 06b return states; notification and Screen Time requests; `AppState` return handling; the `blocked` → `Linking.openSettings()` path; the `PermissionState` contract.
**Dependencies.** Phase 2.
**Done when.** Grant, deny, and deny-then-settings all resolve correctly on both platforms, and a denied user can still reach 07.
**Check.** No fake system sheet exists anywhere in the codebase; 06a auto-advances at 1600ms; denial produces no modal and no nag.

## Phase 4 — Group formation (07–10)

**Build.** `ChoiceCard`, `CodeEntryField`, `OrbitSeat`, `InviteCodeCard`, `NumericTimeSelector`, `AccentPicker`; screens 07, 08, 09 (two steps), 10; deep-link entry that skips 07.
**Dependencies.** Phases 1–3.
**Done when.** Both paths (create and join) reach 11 with a real group, and a deep-linked invite lands directly on 08.
**Check.** The two choice cards are visibly unequal; the invite code renders `FRM-` + six mono digits at 30/800; the time selector's numeral is 60/800 and the range is 2h–14h in 30m steps; every orbit seat sits at one radius.

## Phase 5 — Tracking and readiness (11–13)

**Build.** Screen 11, the system picker bridge, `SelectionResult` (12), `ReadinessRow` and screen 13 with realtime updates and the nudge cooldown.
**Dependencies.** Phase 4, Screen Time permission from Phase 3.
**Done when.** A round trip through the real picker returns a count that renders on 12 and flows into readiness.
**Check.** No app names appear anywhere in Frimit's UI; zero-selection shows the empty variant, not an error; only the current user's row shows setup chips.

## Phase 6 — Waiting room, start and hand-off (14–15 → Today)

**Build.** `WaitingRoomHero`, screen 14 with admin and member variants, screen 15, the realtime `pool_started` event, and `navigation.reset` into `MainTabs`.
**Dependencies.** Phases 4–5, Core Phase 6 (Today must exist to hand off to).
**Done when.** An admin can start a pool and both roles land on Today in the Fresh Day state, with back never returning into onboarding.
**Check.** Members never see `Start our pool`; the start CTA is disabled below two ready members; screen 15's bloom is the largest in the app and Today's is not.

## Phase 7 — Motion and recovery

**Build.** Everything in `ONBOARDING_MOTION_SPEC.md`, the 15 → Today orbit morph (with its documented fallback), and screen 16 wired as the Today state-H hero shared with the core implementation.
**Dependencies.** Phases 2–6, Core Phase 9 (Today states).
**Done when.** The join sequence, the readiness fills, and the morph all run at 60fps, and reduce-motion cleanly degrades every one of them.
**Check.** Screen 16 is the same component as Today's permission-off state — not a second implementation; the orbit narrative reads continuously from 01 to Today; only one looping animation is alive per screen.

---

**Parallelization.** Phase 2 and Phase 3 can overlap once the shell exists. Phase 5 depends on real device permissions and should start early enough to absorb platform surprises. Phase 7 is last by design — do not animate screens that are still changing shape.
