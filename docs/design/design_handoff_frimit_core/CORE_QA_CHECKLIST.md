# CORE_QA_CHECKLIST

Compare the build side by side with the HTML references in `design_files/` at 390 × 844. Check on both iOS and Android.

## Colors
- [ ] Background is #050507; no screen renders a lifted grey.
- [ ] Black (background + near-black surfaces) covers 80%+ of every screen.
- [ ] Card surfaces match per accent: violet #101017, cyan #0E1016, pink #130E12, neutral #0D0D12.
- [ ] Text uses the ramp (primary / 0.90 / 0.44 / 0.34 / 0.28) — no pure #FFFFFF body text.
- [ ] Over-limit uses #FDA4C0, never red; stale sync uses #FCD34D; achievement uses #FDE68A.
- [ ] Accent color appears only as light (arc, bloom, dot, bar), never as a large fill.

## Typography
- [ ] Hero number 52/800 (36 in the compact hero), screen title 32/800, greeting 24/800, section title 15/800.
- [ ] Numbers use tabular figures and don't jitter while counting.
- [ ] Mono labels ("54% USED", "8h · 4") are JetBrains Mono with +10% tracking.
- [ ] Korean and Latin sit on the same baseline in mixed strings.
- [ ] No text below 11px anywhere.

## Spacing
- [ ] Screen horizontal padding 20; content top = inset + 10; bottom padding 108 + inset.
- [ ] Grid gap 12; list row gap 8; section gap 14.
- [ ] Today's total content height ≈ 648 — the third group card is fully visible above the nav.
- [ ] Nothing on any screen sits under the bottom nav.

## Radius
- [ ] Hero 32, group/member card 26, list row 22, activity item 20, button 18, nav pill 20, pills and avatars 999.

## Glow
- [ ] At most two bloom layers per screen, none inside a scrolling list row.
- [ ] Hero bloom is a single top-positioned radial, not a rectangle.
- [ ] Selected nav pill glows; unselected items have no surface at all.
- [ ] Rank 1 is the only member with an achievement glow.
- [ ] No grey Android elevation shadow on any dark card.

## Dot texture
- [ ] Screen 17px / 7.5%, hero card 13px / 5%, calm states 22px / 4.5%.
- [ ] List rows and small cards have no texture.
- [ ] Tiles repeat without visible seams at 2× and 3×.

## Shared Orbit
- [ ] Arc starts at 12 o'clock and fills clockwise.
- [ ] Stroke ≈ 18% of the outer radius.
- [ ] Progress matches `used / limit` to the nearest degree.
- [ ] Segmented variant: one arc per member, 2° gaps, rank order.
- [ ] Over-limit overshoot is a separate outer arc, capped at 60°.
- [ ] Complete state is a full ring at 55–60% opacity with the bloom sunk below.

## Avatar position
- [ ] Every avatar center is at the same radius (measure two opposite avatars).
- [ ] Current user first, at −90°.
- [ ] 2px border matches the surface behind it.
- [ ] Stack overlap is −9 and the first avatar stays on top.

## Ranking
- [ ] Sorted ascending by usage (least screen time = rank 1).
- [ ] Ranks 2..n share one neutral surface — no descending color ramp, no "last place" treatment.
- [ ] Crown, gold label and achievement ring appear together, on rank 1 only.
- [ ] Stale sync shows an amber dot and caption; no other row is marked.

## Group accent
- [ ] Each group keeps its accent across Today, Group Detail, Activity and Goals.
- [ ] Accent drives dot, arc, bloom and bar only — surfaces, text and radius are identical between groups.

## Bottom navigation
- [ ] Height 104 + safe-area inset; hit targets ≥ 44px.
- [ ] Selected pill uses the tab's accent; label tint matches.
- [ ] Scrim is opaque at the bottom; content scrolls under it without a hard edge.

## State transitions
- [ ] A → H all render with the identical layout; only light, copy and gauge change.
- [ ] Thresholds fire at 5% / 70% / 88% / 100% / over.
- [ ] Sync overlay composes onto B–F without moving anything but the gauge box.
- [ ] Permission-off: grey gauge, no bloom, CTA is the only saturated element.
- [ ] Reduce-motion disables loops and rotation.

---

## Edge cases

- [ ] **2 members** — orbit avatars at top and bottom; ranking shows two rows; the hero still reads as shared.
- [ ] **4 members** — matches the reference exactly.
- [ ] **8 members** — avatars shrink one step, stay on one radius, don't collide; ranking scrolls; Group Detail becomes scrollable.
- [ ] **9+ members** — first 7 plus a `+N` disc.
- [ ] **Long nickname** (12+ chars) — truncates with an ellipsis in ranking rows; never wraps to two lines in the hero footer.
- [ ] **Long group name** (16+ chars) — the pill truncates; the Group Detail title wraps to at most two lines.
- [ ] **10h+ shared time** — hero number "10h 24m" fits inside the gauge without touching the arc (check at 36px and 52px).
- [ ] **24h+ over** — "1d 2h over" formats correctly and still fits; the overshoot arc stays capped at 60°.
- [ ] **Stale sync on 2 of 4 members** — only one amber row per member, one dashed ring, one `~` prefix.
- [ ] **No data yet today** (fresh, 0 used) — the tick at 12 o'clock is visible; the ring never looks broken.
- [ ] **Permission off** — user can still browse Goals, Activity and MY; the group's other members' data still renders.
- [ ] **Empty group** (one member) — ranking replaced by the empty state; the orbit shows one avatar and dashed seats.
- [ ] **No groups at all** — Today shows the empty state with a create CTA; the nav still works.
- [ ] **Offline** — last known values persist with an amber retry affordance; no blank hero.
