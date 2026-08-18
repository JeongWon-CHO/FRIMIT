# ONBOARDING_QA_CHECKLIST

Compare against `design_files/Frimit Onboarding.dc.html` at 390 × 844, on both platforms. Core checks (colors, type, radius, glow discipline) still apply — see `design_handoff_frimit_core/CORE_QA_CHECKLIST.md`. Below are the onboarding-specific ones.

## Frame and rhythm
- [ ] Horizontal padding is 26 on screens 01–15 and 20 on screen 16.
- [ ] Every screen uses the top-block / figure / bottom-CTA rhythm; nothing floats mid-screen by accident.
- [ ] No bottom navigation on 01–15; present on 16 with Today active.
- [ ] Content clears both safe-area insets on a notched device and on a device with a home indicator.
- [ ] Each screen scrolls rather than clipping at the largest system font size.
- [ ] Transitions are fades, not iOS slides.

## Continuity with the core app
- [ ] Same background, dot texture, surfaces, radii and type scale as Today.
- [ ] No color, gradient or radius appears here that isn't in `DESIGN_TOKENS.ts`.
- [ ] Nothing in `design_handoff_frimit_core/` was modified.
- [ ] Screen 16 is the Today state-H implementation, not a copy.

## Orbit narrative
- [ ] 01 shows one bright light and three dim ones — no avatars, no numbers.
- [ ] 07's create card contains a 64px mini-orbit with me at the center and three dashed seats.
- [ ] 08 shows exactly one dashed seat and it is the user's.
- [ ] 10 shows one filled seat, three dashed, and the arc at the joined fraction.
- [ ] 14 fills seats as members become ready; 15 has every seat glowing.
- [ ] Across every screen, all seats on one orbit share a single radius (measure two opposite seats).
- [ ] Orbit sizes match: 250 (01, 10), 270 (08), 280 (14), 300 (15), 190 (12), 170 (06), 158 (16), 64 (07 mini).
- [ ] Arc always starts at 12 o'clock and fills clockwise.

## Copy
- [ ] All strings match the reference verbatim, including the Korean lines and the emoji in the sample notification.
- [ ] Headline sizes: 38 (01), 32 (02, 15), 30 (03, 04, 05, 07, 09-title, 10, 11, 13), 28 (06), 26 (14), 24 (choice card).
- [ ] Numeric hero sizes: 60 (09 selector), 64 (12 count), 56 (14), 52 (15), 44 (08), 40 (10), 30 (10 invite code).
- [ ] No copy explains the system UI's buttons; the only reference to it is 06's neutral note.

## Permissions
- [ ] No screen imitates an OS permission sheet or the app picker.
- [ ] The notification request fires only from `Turn on notifications`.
- [ ] 05 always precedes 06, including on deep-link entry.
- [ ] 06a auto-advances at ~1600ms with a tappable button; 06b has no motion beyond the route transition.
- [ ] `blocked` state routes `Try again` to system settings and relabels the button.
- [ ] A denied user completes the whole flow and appears as "Waiting for Screen Time" in readiness.
- [ ] Returning from Android's usage-access settings without a change is treated as denied.

## Privacy
- [ ] The "Friends can't see" rows are static examples, never real usage data.
- [ ] No app names appear on 12 or anywhere else in Frimit's UI.
- [ ] Only the count, total minutes and sync timestamp leave the device.
- [ ] The selection is stored per group, and changing groups doesn't overwrite another group's selection.

## Group formation
- [ ] The two options on 07 are visibly unequal (250 vs 210, glow vs flat).
- [ ] Code entry accepts six digits, validates on the sixth, and shakes on failure.
- [ ] Invite code renders as `FRM-` plus six mono digits; copy feedback is in-card, not a toast.
- [ ] Time selector: range 2h–14h, 30m steps, disabled states at both ends, long-press repeat.
- [ ] The per-person caption recalculates with the member count.
- [ ] Accent picker offers exactly the three system accents.
- [ ] The chosen accent carries through to 10, 11, 13, 14, 15 and then into Today.

## Readiness and start
- [ ] Only the current user's row shows setup chips.
- [ ] Pending members use a dashed row with an amber reason; no red, no shaming.
- [ ] Nudge disables for 60 seconds after use.
- [ ] `Start our pool` is disabled below two ready members and never shown to non-admins.
- [ ] Members are pushed to 15 by the realtime event without a manual refresh.
- [ ] After 15, back does not return into onboarding.

## Motion
- [ ] Join sequence runs in ~620ms with the documented five steps.
- [ ] The 15 → Today morph interpolates from a single progress value; the fallback crossfade exists and is never a hard cut.
- [ ] One looping animation per screen, cancelled on blur.
- [ ] Reduce motion disables loops, the orbit draw, and the morph.
- [ ] Nothing animates blur radius or gradient stop positions.

---

## Edge cases

- [ ] **Deep link while logged out** — auth and profile run first, the invite is held, and the user lands on 08 (not 07).
- [ ] **Expired or invalid invite** — 08 shows the empty-state variant with a code-entry action.
- [ ] **Group already full** — 08 explains it; no dead end.
- [ ] **Relaunch mid-flow** at each phase resumes per the rules in `ONBOARDING_NAVIGATION.md`.
- [ ] **Nickname 12+ characters** — truncates in the readiness row and the orbit label, never wraps in the hero.
- [ ] **Group name 16+ characters** — the pill truncates, the 08 title wraps to at most two lines at 34/800.
- [ ] **2-member group** — orbit seats at top and bottom; the start CTA enables at exactly two ready members.
- [ ] **8-member group** — seats shrink one step, stay on one radius, don't collide; 13 scrolls.
- [ ] **Zero apps selected** — 12's empty variant appears and the CTA reopens the picker.
- [ ] **Notification denied, Screen Time granted** — no notification prompts later in the flow; MY reflects the real status.
- [ ] **Screen Time granted, then revoked in Settings mid-flow** — readiness flips to pending on `AppState` active without a crash.
- [ ] **Permission granted from screen 16** — Today animates from state H to live without a restart.
- [ ] **Two members join simultaneously on 10** — seats stagger 140ms; the counter lands on the right number.
- [ ] **Offline during creation** — the CTA shows its loading state, then an inline error; no navigation, no lost form input.
- [ ] **Slow network on 08** — the invite preview shows its shimmer, never an empty orbit with a stale name.
