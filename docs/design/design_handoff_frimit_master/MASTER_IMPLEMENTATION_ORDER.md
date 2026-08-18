# MASTER_IMPLEMENTATION_ORDER

One roadmap for Core + Onboarding, ordered by real dependency rather than by document. It supersedes the ordering in `CORE_IMPLEMENTATION_ORDER.md` and `ONBOARDING_IMPLEMENTATION_ORDER.md` — those remain useful for their per-phase detail, but this is the sequence to follow.

Each phase lists: **dependencies · target · completion criteria · visual QA point · functional regression risk.**

---

## Phase 0 — Existing project audit

**Dependencies.** None.
**Target.** Understand the current Expo app before touching it. Inventory: navigation structure, Screen Time / Family Controls native modules, Supabase schema and queries, stores, business logic, existing component folder, font loading, and any current theming layer.
**Completion criteria.** A short written map of what exists, which screens are already wired to data, and which existing components will be restyled versus replaced. A decision recorded for each: keep, restyle, replace.
**Visual QA point.** Screenshots of the current app for before/after comparison.
**Regression risk.** The highest-value rule of this project: **design implementation must not rewrite working logic.** Screen Time bridges, sync logic, auth and queries stay as they are. Restyle the view layer; leave data and native modules alone.

---

## Phase 1 — Design foundation

**Dependencies.** Phase 0.
**Target.** `DESIGN_TOKENS.ts` in place; Manrope + JetBrains Mono loading; the three dot-texture tiles in assets; helpers for `Surface`, gradient wrappers, `Bloom` (SVG RadialGradient), and dot texture; time formatters and `poolState()`.
**Completion criteria.** No literal color, radius or font size anywhere in new code. A scratch screen proves #050507 renders as #050507 on device.
**Visual QA point.** Token swatch screen matches the Design System page.
**Regression risk.** Font loading can block first render — gate the splash on `useFonts`, and confirm Korean glyphs still resolve through the system fallback.

---

## Phase 2 — Primitive components

**Dependencies.** Phase 1.
**Target.** `AppText`, `Surface`, `GradientButton` (primary / secondary / tertiary), `StatusPill`, `Avatar`, `AvatarStack`, `ProgressBar` (12 / 6 / 5), `EmptyState`, `Bloom`.
**Completion criteria.** A gallery screen renders every primitive in every variant and state.
**Visual QA point.** Black covers 80%+ of the gallery; pills read as glass with no blur dependency; avatar borders match their parent surface.
**Regression risk.** Replacing an existing shared `Text`/`Button` can ripple through untouched screens — introduce the new primitives alongside the old ones and migrate screen by screen.

---

## Phase 3 — Signature components

**Dependencies.** Phases 1–2. Read `SHARED_ORBIT_SPEC.md` in full first.
**Target.** `SharedOrbitRing` (continuous, segmented, complete, overshoot, empty), computed avatar angles for 2–9 members, `OrbitSeat`, `SharedPoolHero`, the goal progress bar with its tip dot.
**Completion criteria.** A demo screen shows every variant at sizes 122 / 158 / 162 / 190 / 250 / 300 and every member count 2–9. Progress matches `used / limit` to the nearest degree.
**Visual QA point.** **This gate blocks Phase 5.** Measure two opposite avatars: identical radius. Arc starts at 12 o'clock. Segment gaps 2°. Stroke ≈ 18% of the outer radius. The glow does not double-draw the arc tip.
**Regression risk.** SVG mounted per list row will hurt later — keep the orbit out of any list component from the start.

---

## Phase 4 — App shell and navigation

**Dependencies.** Phases 2–3, plus the existing routing from Phase 0.
**Target.** Custom `BottomNavigation`, four tab screens, Group Detail as a pushed route, safe-area handling, screen containers with the documented paddings.
**Completion criteria.** Tab switching never flashes white; the selected pill glows; content reserves 108 + bottom inset.
**Visual QA point.** Nav height 104 + inset, hit targets ≥ 44, selected pill accent per tab.
**Regression risk.** Swapping the tab bar can break deep links and existing route params — keep route names, change only the presentation.

---

## Phase 5 — Today

**Dependencies.** Phases 3–4.
**Target.** Header, `SharedPoolHero`, section title, group grid, real data, pull-to-refresh. Build the **Normal** state first and ship it before touching the other states.
**Completion criteria.** Matches `Frimit.dc.html` at 390×844 with no scrolling for three groups; total content ≈ 648px.
**Visual QA point.** The hero number is the first thing the eye lands on; the third group card is fully visible above the nav.
**Regression risk.** The existing Today data hook may return different shapes than the spec assumes — adapt in a selector, not by changing the layout.

---

## Phase 6 — Today states

**Dependencies.** Phase 5.
**Target.** In this order: Fresh → 75% → 90% → Limit reached → Over → Sync issue → Permission off. Thresholds behind a single `poolState()`.
**Completion criteria.** A dev toggle walks all eight states; layout is byte-identical between them.
**Visual QA point.** Only light, gradient, copy and gauge change. Over-limit never tints the background red. Permission-off's only saturated element is its CTA.
**Regression risk.** The permission-off state is shared with onboarding screen 16 — implement it once here and reuse it in Phase 10, not twice.

---

## Phase 7 — Group Detail

**Dependencies.** Phases 3–5.
**Target.** Nav bar, segmented orbit hero with the side-by-side number column, ranking (rank-1 member card + ranking rows), personal limit card, stale-sync treatment.
**Completion criteria.** Matches its design file for four members and scrolls cleanly for eight.
**Visual QA point.** Rank 1 is the only member with a glow; no red anywhere; hierarchy reads Our time → ranking → my limit.
**Regression risk.** Ranking sorts ascending by usage — verify against the existing query's default ordering before assuming.

---

## Phase 8 — Goals, Activity, MY

**Dependencies.** Phases 2–5.
**Target.** The three remaining tabs and their lists, empty and loading states, reusing every component from Phases 2–3.
**Completion criteria.** Each matches its section of `Frimit.dc.html`.
**Visual QA point.** Activity stays a quiet event stream, not feed cards. Goals' percentage is the largest type on that screen. MY's stat numbers use the 26px treatment.
**Regression risk.** Activity is the only long list — confirm `FlatList` performance here before Phase 12.

---

## Phase 9 — Onboarding foundation

**Dependencies.** Phases 1–4.
**Target.** `OnboardingStack` with fade transitions and the documented back/gesture rules; the onboarding screen wrapper (26px padding, `space-between` rhythm); `StepProgress`; onboarding-only components: `ChoiceCard`, `CodeEntryField`, `InviteCodeCard`, `NumericTimeSelector`, `AccentPicker`, `PermissionExplanation`, `PrivacyDisclosureCard`, `ReadinessRow`, `SelectionResult`, `WaitingRoomHero`.
**Completion criteria.** Sixteen placeholder routes navigate end to end; `onboardingStep` persistence resumes correctly after a relaunch.
**Visual QA point.** Onboarding and Core share surfaces, type and radii; only padding and orbit scale differ.
**Regression risk.** Do not fork the design system for onboarding. Any token or component that feels onboarding-specific but isn't belongs in Core.

---

## Phase 10 — Onboarding flow

**Dependencies.** Phase 9; Phase 5 for the hand-off target.
**Target.** In order: Welcome → Sign In → Profile → Notification intro → Privacy intro → Permission → Create or Join → Create group / Invitation preview → Invite friends → Tracking intro → Selection result → Readiness → Waiting room → Group started. Then screen 16 wired to the Phase 6 permission-off implementation.
**Completion criteria.** Both paths (create and join) reach a live pool; a deep-linked invite skips Create-or-Join; `navigation.reset` into the tabs means back never re-enters onboarding.
**Visual QA point.** The orbit narrative reads continuously: one light → dashed seats → my empty seat → seats filling → all glowing.
**Regression risk.** Existing auth and group-creation logic stays — the new screens call it, they don't replace it.

---

## Phase 11 — Permission and native UI integration

**Dependencies.** Phase 10; the native modules audited in Phase 0.
**Target.** Real notification and Screen Time requests, `AppState`-based return handling, the `blocked` → settings path, the `FamilyActivityPicker` / Android selection bridge, per-group selection storage.
**Completion criteria.** Grant, deny, deny-then-settings, and revoke-mid-flow all resolve correctly on both platforms.
**Visual QA point.** No mock system sheet exists in the codebase. 06a auto-advances at ~1600ms; denial produces no modal and no nag.
**Regression risk.** Highest of the project. Reuse the existing native bridge; only the surrounding screens are new. Verify that app selection tokens are still stored per group and that nothing but count + minutes + timestamp leaves the device.

---

## Phase 12 — Motion

**Dependencies.** Phases 5–11.
**Target.** Core motion (pool update, state transitions, nav, press, ranking, achievement, stale sync, goal progress) then onboarding motion (orbit intro, seat appearance, join sequence, waiting room, Group Started) and finally the **Group Started → Today hero morph** with its documented fallback.
**Completion criteria.** A sync visibly animates arc and number; state changes crossfade; the morph runs from a single progress value; reduce-motion degrades everything cleanly.
**Visual QA point.** One looping animation per screen, cancelled on blur. No animated blur radius. The morph is never a hard cut.
**Regression risk.** Reanimated worklets touching state can cause crashes on the old architecture — verify against the project's RN version before adding shared transitions.

---

## Phase 13 — Visual QA and polish

**Dependencies.** All previous phases.
**Target.** Work `MASTER_QA_CHECKLIST.md` end to end, side by side with the HTML in both `design_files/` folders, on a small device (iPhone SE class), a large device, and a mid-range Android.
**Completion criteria.** Every checklist item passes or has a recorded, accepted exception.
**Visual QA point.** Side-by-side screenshots per screen at 390×844.
**Regression risk.** Late visual fixes that touch shared primitives — re-run the gallery screen from Phase 2 after any token change.

---

### Parallelization

Phases 3 and 4 can run beside each other after Phase 2. Phases 7 and 8 can run in parallel after Phase 5. Phase 9 can start as soon as Phase 4 lands, but Phase 10 must wait for Phase 5 (it needs somewhere to hand off to). Phase 11 should start early on a spike branch — platform permission behavior is where schedules slip.
