# MASTER_QA_CHECKLIST

Release gate for Frimit Design V1. This is the consolidated pass — the essential checks across Core and Onboarding. For per-screen depth, use `design_handoff_frimit_core/CORE_QA_CHECKLIST.md` and `design_handoff_frimit_onboarding/ONBOARDING_QA_CHECKLIST.md`.

Run on: a small device (iPhone SE class), a standard device (390×844), a large device, and a mid-range Android. Always side by side with the HTML in the two `design_files/` folders.

---

## Global

- [ ] Background #050507 everywhere; no screen renders a lifted grey.
- [ ] Black covers 80%+ of every screen; accent color appears only as light (arc, bloom, dot, bar).
- [ ] Type scale matches: hero 52 / compact 36, screen title 32, greeting 24, section 15, card number 22, body 14, metadata 12, mono label 11. Nothing below 11.
- [ ] Numbers use tabular figures and don't jitter while animating.
- [ ] Spacing: core screens 20 horizontal, onboarding 26; grid gap 12, row gap 8, section gap 14.
- [ ] Radius: hero 32, card 26, row 22, activity 20, button 18, nav pill 20, pills/avatars 999.
- [ ] Surfaces match per accent (violet #101017, cyan #0E1016, pink #130E12, neutral #0D0D12).
- [ ] Dot texture: screen 17px/7.5%, hero card 13px/5%, calm 22px/4.5%; list rows and small cards untextured; no seams at 2× / 3×.
- [ ] Group accents (violet / cyan / pink) persist for the same group across Today, Group Detail, Activity, Goals and onboarding.
- [ ] No color, gradient or radius exists in the app that isn't in `DESIGN_TOKENS.ts`.

## Shared Orbit

- [ ] Progress equals `used / limit` to the nearest degree; arc starts at 12 o'clock, fills clockwise.
- [ ] Remaining segment is `rgba(255,255,255,0.055)`; used segments carry the state gradient.
- [ ] Segmented variant: one arc per member in rank order, 2° gaps.
- [ ] Over-limit renders a separate outer pink arc, capped at 60°; complete renders a full ring at 55–60%.
- [ ] Every avatar on one orbit sits at the same radius (measure two opposite seats).
- [ ] Member counts 2, 3, 4, 5–6, 7–8 all place cleanly with the documented size steps; 9+ shows 7 + `+N`.
- [ ] Glow is one blurred duplicate arc, not a second visible ring.
- [ ] Arc animates via `strokeDashoffset` only.

## Core screens

- [ ] **Today** — hero number reads first; three groups fit without scrolling; the wide third card clears the nav.
- [ ] **Goals** — group percentage is the largest type; member bars have no glow; tip dot sits on the fill's end.
- [ ] **Activity** — quiet event stream, not feed cards; day dividers at 0.28 opacity; reaction chips never wrap.
- [ ] **MY** — profile ring breathes; stat numbers at 26/800; group rows show accent dots; toggle uses the violet→blue gradient.
- [ ] **Group Detail** — orbit + numbers side by side; rank 1 is the only glowing member; personal limit card is visibly the quietest element.
- [ ] Every screen's hierarchy reads Our time → my time → ranking.

## Today states

- [ ] Layout is identical across all eight; only light, gradient, copy and gauge change.
- [ ] **Fresh** — cyan-led, lowest luminance, 12 o'clock tick visible so the ring never looks broken.
- [ ] **Normal** — violet → blue → cyan, 54% reference render matches.
- [ ] **75%** — cyan drops out; bloom rises and grows; pill switches to violet tone.
- [ ] **90%** — violet → magenta; bloom breathes at 4.5s; the number stays white.
- [ ] **Limit reached** — full ring at reduced opacity; bloom sinks below the ring; calm dot texture; framed as completion, not failure.
- [ ] **Over** — pink number and outer arc; background stays black.
- [ ] **Sync issue** — dashed amber ring + one sync row; `~` prefix on the percentage; composes onto Normal through Over.
- [ ] **Permission off** — grey gauge, no bloom, CTA is the only saturated element; identical to onboarding screen 16 (one implementation).
- [ ] Thresholds fire at 5% / 70% / 88% / 100% / over.

## Onboarding

- [ ] Sixteen screens match their reference; onboarding rhythm (top block / figure / bottom CTA) holds throughout.
- [ ] **Navigation** — fades not slides; back rules honored; `navigation.reset` after Group Started; resume works after a mid-flow relaunch.
- [ ] **Create path** — 07 → 09 (two steps) → 10 → 11 → 12 → 13 → 14 → 15 → Today.
- [ ] **Join path** — code entry validates on the sixth digit → 08 → 11 onward.
- [ ] **Invitation link path** — deep link skips 07; unauthenticated users complete 02–03 first and the invite is preserved.
- [ ] **Permission denied path** — the user completes the whole flow and appears as "Waiting for Screen Time"; nothing blocks.
- [ ] **Recovery path** — screen 16 / MY CTA → grant → Today animates from state H to live without a restart.
- [ ] **Waiting room** — admin sees `Start our pool` (disabled below two ready members); members see the waiting line; seats fill in realtime.
- [ ] **Group started** — largest bloom in the app; no confetti; `See today` morphs the orbit into the Today hero.
- [ ] Orbit narrative reads continuously: one light → dashed seats → my empty seat → filling → all glowing → Today hero.
- [ ] Time selector: 2h–14h, 30m steps, 60/800 numeral, disabled at both ends.
- [ ] Invite code renders `FRM-` + six mono digits; copy feedback is in-card.

## System UI

- [ ] No fake OS notification sheet, Screen Time sheet, app picker or share sheet exists anywhere in the codebase.
- [ ] Every system prompt is triggered by an explicit user tap, never automatically.
- [ ] Return states are accurate on both platforms, including Android returning from usage-access settings with no change (treated as denied).
- [ ] `blocked` permissions route to system settings with relabeled copy.
- [ ] Privacy contract holds: no app names in Frimit UI; only count, total minutes and sync timestamp leave the device; selection stored per group.
- [ ] Permission revoked externally mid-session is detected on `AppState` active without a crash.

## Responsive and edge cases

- [ ] 2 / 4 / 8 members render correctly on the orbit, ranking, readiness and waiting room.
- [ ] Long nickname (12+ chars) truncates in rows; never wraps in a hero or footer.
- [ ] Long group name (16+ chars) truncates in pills; wraps to at most two lines in titles.
- [ ] Small device: every screen scrolls instead of clipping; no CTA is pushed off-screen.
- [ ] Large device: layouts don't stretch into empty space; the orbit stays centered.
- [ ] 10h+ shared time fits inside the gauge without touching the arc.
- [ ] 24h+ over formats correctly and the overshoot arc stays capped.
- [ ] Stale sync on multiple members shows one dashed ring and per-member amber rows only.
- [ ] No data / fresh pool / empty group / no groups at all each render their intended state, never a blank hero.
- [ ] No permission: Goals, Activity and MY remain fully browsable.
- [ ] Offline: last known values persist with an amber retry affordance; loading states never spin indefinitely.

## Motion and performance

- [ ] No jank on the Today gauge animation or the Group Started morph.
- [ ] No runtime blur in a list row; at most two bloom layers per screen.
- [ ] One looping animation per screen, cancelled on blur — nothing pulses on an unfocused tab.
- [ ] No `<Svg>` mounted per list row; bars are plain views with gradients.
- [ ] `GroupCard`, `RankingItem`, `ActivityItem` are memoized; no per-frame `setState`.
- [ ] Activity scrolls at 60fps with 100+ items on a mid-range Android.
- [ ] Today mounts in under ~400ms on a mid-range Android.
- [ ] Reduce motion disables loops, the orbit draw and the morph; the app remains fully usable.

## Final visual fidelity — side by side with the original HTML

For each of Today (all eight states), Goals, Activity, MY, Group Detail, and onboarding 01–16:

- [ ] Hero number size, weight and tracking match; the number is the first fixation point.
- [ ] Bloom position, color and size match — not just its presence.
- [ ] Card surfaces read as different objects, not one repeated rectangle.
- [ ] Avatar sizes, borders and orbit radii match.
- [ ] Dot texture density differs between screen, hero card and calm surfaces.
- [ ] Selected bottom-nav pill matches in fill, border, glow and label tint.
- [ ] Group accent is recognizable from color alone, without reading the group name.
- [ ] Nothing new has been added that isn't in the approved design — no extra labels, icons, dividers or helper text.
