# CORE_IMPLEMENTATION_ORDER

Ten phases. Each phase is safe to merge on its own. Do not start a phase before its dependencies are done — the ordering exists so that no screen is built on a component that later changes shape.

---

## Phase 1 — Design tokens

**Build.** Drop in `DESIGN_TOKENS.ts`. Add `poolState()` from `TODAY_STATE_SPEC` and time formatters (`formatDuration`, `formatOver`, `formatPercent`).
**Dependencies.** None.
**Done when.** No component in the codebase holds a literal color, radius, or font size.
**Check.** `colors.background.base` renders as #050507 on device (not a lifted grey from a theme provider).

## Phase 2 — Primitives

**Build.** `AppText` (typography variants + tabular figures), `Surface` (radius, hairline, optional dot texture), `Bloom` (SVG RadialGradient), `GradientButton`, `Avatar`, `AvatarStack`, `StatusPill`, `ProgressBar`, `EmptyState`.
**Dependencies.** Phase 1, fonts loaded, three dot tiles in assets.
**Done when.** A scratch screen shows every primitive in every variant.
**Check.** Black is 80%+ of the scratch screen. Avatar borders match their parent surface. Pills read as glass without any blur.

## Phase 3 — Navigation shell

**Build.** Tab navigator with the custom `BottomNavigation`, four empty screens, safe-area handling, Group Detail as a pushed route.
**Dependencies.** Phase 2.
**Done when.** Tab switching keeps the background black with no white flash; the selected pill glows; content padding reserves 108 + inset.
**Check.** Selected-pill glow matches the mock on both platforms (static bloom on Android).

## Phase 4 — Shared Orbit

**Build.** `SharedOrbitRing` with continuous, segmented, complete, overshoot and empty variants; computed avatar angles for 2–8 members; the `strokeDashoffset` animation.
**Dependencies.** Phases 1–2.
**Done when.** A demo screen renders every variant at sizes 122 / 162 / 250 and every member count 2–9.
**Check.** Every avatar center sits at exactly the same radius; the arc starts at 12 o'clock; segment gaps are 2°; the glow does not double-draw the arc tip.

## Phase 5 — Reusable cards

**Build.** `GroupCard`, `MemberCard`, `RankingItem`, `RankingBadge`, `PersonalLimitCard`, `GoalCard`, `ActivityItem`, `PermissionCTA`.
**Dependencies.** Phases 2 and 4.
**Done when.** Each card renders from mock data in all its variants, including over-limit and stale.
**Check.** One bloom per card; per-accent bloom positions differ; the personal-limit card is visibly quieter than anything with a bloom.

## Phase 6 — Today

**Build.** Header, `SharedPoolHero`, section title, group grid, wiring to real data, pull-to-refresh.
**Dependencies.** Phases 3–5.
**Done when.** The screen matches `Frimit.dc.html` at 390×844 with no scrolling for three groups.
**Check.** Hero number is the first thing the eye lands on; content clears the nav; total stack ≈ 648px.

## Phase 7 — Group Detail

**Build.** Nav bar, segmented orbit hero with the side-by-side number column, ranking list, personal limit card.
**Dependencies.** Phases 4–5.
**Done when.** Matches `Frimit Group Detail.dc.html` for four members and scrolls cleanly for eight.
**Check.** Rank 1 is the only member with a glow; no red anywhere; hierarchy reads Our time → ranking → my limit.

## Phase 8 — Goals, Activity, MY

**Build.** The three remaining tabs, their lists and empty states.
**Dependencies.** Phases 3–5.
**Done when.** Each matches its section of `Frimit.dc.html`.
**Check.** Activity items stay a quiet stream (no feed cards); MY's stat cards use the same 26px numeric treatment as the mock; Goals' hero percentage is the largest type on that screen.

## Phase 9 — Today state variations

**Build.** All eight states behind `poolState()`, plus the sync overlay and the permission-off hero.
**Dependencies.** Phases 4 and 6.
**Done when.** A dev toggle can walk A → H and every state matches `Frimit Today States.dc.html`.
**Check.** Layout is identical across states; only light, gradient, copy and gauge change. The over-limit state does not tint the background red. The permission-off state's only saturated element is the CTA.

## Phase 10 — Motion and polish

**Build.** Everything in `MOTION_SPEC.md`, reduce-motion handling, loop cancellation on blur, haptics on rank-1.
**Dependencies.** Phases 6–9.
**Done when.** A sync visibly animates the arc and the number; state changes crossfade; presses sink; nothing loops in the background.
**Check.** 60fps on a mid-range Android with Activity scrolling; no animation runs when reduce-motion is on; the dashed stale ring rotates slowly enough to read as waiting.

---

**Suggested parallelization.** Phases 4 and 5 can run beside each other after Phase 2. Phases 7 and 8 can run in parallel after Phase 5. Everything else is sequential.
