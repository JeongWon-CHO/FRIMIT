# MAIN_SCREEN_SPEC

Reference device: 390 × 844. All screens: background `colors.background.base` (#050507) + screen dot texture (`dotTexture.screen`, 17px tile) + at most one screen-level ambient bloom. Horizontal padding `spacing.screenHorizontal` (20). Content top inset 64 (62 where the screen starts with a title row). Bottom inset 108 so nothing sits under the 104px nav.

Safe area: apply `useSafeAreaInsets()`. Top inset replaces the mocked 54px status bar; bottom inset is added **inside** the nav's 104px height (the nav grows, content padding stays 108 + inset).

---

## 1. Today

**Purpose.** Answer "how much time do we have left together today?" in under a second, then show the user's other groups.

**Information hierarchy.** Remaining shared time → group identity → my other groups → sync freshness.

**Structure.**
```
SafeArea
 ├ Header (greeting + avatar)
 ├ SharedPoolHero
 ├ SectionTitle ("Your groups" + count)
 ├ GroupGrid (2 columns; 3rd card spans both)
 └ BottomNavigation (active: today)
```

**Exact layout.**
- Content padding: `64 / 20 / 108`, column gap 14.
- Header: row, `space-between`, align start, padding `0 4`. Greeting `typography.greeting` (24/800/−0.6) + subline 14/500 in `text.muted`, gap 5. Avatar `md` (44 in the mock: 44×44 with a −4 inset activity ring).
- Hero: see `COMPONENT_SPEC` §1. Height ≈ 290.
- Section title row: height 20, padding `2 6 0`.
- Grid: 2 columns, gap 12. Card 1 & 2 height 124. Card 3 spans both columns, height 88.
- Total content height ≈ 648 of 672 available — do not add elements without removing others.

**Components.** Header, `SharedPoolHero`, `SharedOrbitRing`, `Avatar`, `AvatarStack`, `GroupCard`, `StatusPill`, `BottomNavigation`.

**Scroll.** Content fits without scrolling at 390×844 for up to 3 groups. With 4+ groups make the whole content a `ScrollView` (`showsVerticalScrollIndicator={false}`, `contentContainerStyle.paddingBottom = 108 + insets.bottom`). The header scrolls with the content; the nav does not.

**Data.** Greeting name; time of day (morning/afternoon/evening); primary group name, accent, limit, used, members, last sync; per-group remaining or over amount, member list, accent.

**Interaction.** Tap hero → Group Detail for that group. Tap group card → Group Detail. Long-press hero → refresh sync (optional). Pull-to-refresh triggers a resync and the "Updated just now" label.

**Navigation.** Hero / card → Group Detail. Nav → Goals, Activity, MY.

**States.**
- Loading: hero skeleton (track-only ring, 96×28 shimmer for the number), two card skeletons. No spinner.
- Empty (no groups): hero replaced by `EmptyState` "아직 그룹이 없어요 / 친구 한 명만 있으면 공동 시간을 시작할 수 있어요." plus a primary CTA "그룹 만들기".
- Error (sync failed): keep the last known numbers, footer left becomes "Updated —" and a `StatusPill` tone `amber` with "다시 시도" appears in the footer right.
- Permission off: see `TODAY_STATE_SPEC` §H.

---

## 2. Goals

**Purpose.** Track shared goals and each friend's contribution.

**Information hierarchy.** Group progress % → goal title → per-member progress → secondary goals.

**Structure.**
```
SafeArea
 ├ TitleRow ("Goals" + add button)
 ├ GoalCard (hero)
 ├ GoalGrid (2 compact cards)
 └ BottomNavigation (active: goals)
```

**Exact layout.**
- Content padding `66 / 20 / 108`, column gap 16.
- Title row: `screenTitle` (32/800) + 38px circular add button (`surface.glass`, `border.hairlineStrong`, "+" 20/600).
- Hero goal card: radius 32, padding 22. Internal order: pill row (group name pill + "7 days left" in `accent.bluePale`) → title 24/800 (margin-top 18) → percent 56/800 + caption → progress bar 12px with tip (margin-top 18) → divider (margin-top 22, padding-top 18) → 3 member rows, gap 14.
- Compact grid: 2 columns, gap 12, height 142, radius 26, padding 16.

**Components.** `GoalCard`, `ProgressBar`, `Avatar`, `StatusPill`, `BottomNavigation`.

**Scroll.** `ScrollView` once there are more than 3 goals.

**Data.** Goal title, owning group, deadline, group progress, each member's done/total, secondary goal progress and streaks.

**Interaction.** Tap hero goal → Goal Detail (out of scope for this handoff; route stub). Tap "+" → create-goal flow (stub). Tap a compact card → same detail route.

**States.** Loading: two skeleton bars in the hero, grid cards at 40% opacity. Empty: `EmptyState` "아직 목표가 없어요" + "목표 만들기". Error: inline retry row above the grid.

---

## 3. Activity

**Purpose.** A quiet event stream of what happened in the group today.

**Information hierarchy.** Today's pool usage summary → today's events → older events.

**Structure.**
```
SafeArea
 ├ TitleRow ("Activity" + group filter pill)
 ├ UsageSummaryCard (75% + 5-bar sparkline)
 ├ DayDivider ("TODAY")
 ├ ActivityItem × n
 ├ DayDivider ("YESTERDAY")
 ├ ActivityItem × n
 └ BottomNavigation (active: activity)
```

**Exact layout.**
- Content padding `66 / 20 / 108`, column gap 10.
- Title row: `screenTitle` + group `StatusPill` (glass, cyan dot).
- Summary card: radius 24, padding `14px 20px`, row `space-between`. Left: caption 12/600 + 28/800 number. Right: five bars, width 8, radius 3, heights 40/62/30/78/100% of a 52px box; the last two use `gradients.violetToBlue` and `gradients.blueToCyan` with a soft shadow, the first three `rgba(255,255,255,0.14)`.
- Day dividers: `typography.eyebrow`, opacity 0.28, padding `0 4`.
- Items: gap 4 inside a day group, 10 between groups.

**Components.** `ActivityItem`, `StatusPill`, `Avatar`, `BottomNavigation`.

**Scroll.** Always a `FlatList` (sectioned). Item height varies 58–74; do not set a fixed `getItemLayout` unless reactions are excluded.

**Data.** Event kind, actors, templated text (bold span for numbers), relative time, reactions, group.

**Interaction.** Tap an event with a single actor → that member's day in Group Detail. Long-press → reaction sheet (stub). The group pill opens a group filter.

**States.** Loading: three ghost rows (38px circle + two bars). Empty: `EmptyState` "오늘은 조용하네요". Error: retry row at the top of the list.

---

## 4. MY

**Purpose.** Personal profile, personal stats, group membership and the few settings that matter.

**Information hierarchy.** Identity → my numbers → my groups → settings.

**Structure.**
```
SafeArea
 ├ ProfileBlock (96px avatar with activity ring, name, handle)
 ├ StatGrid (2 cards)
 ├ SectionTitle ("MY GROUPS")
 ├ GroupRow × 3
 ├ SettingsRow × 2
 └ BottomNavigation (active: my)
```

**Exact layout.**
- Content padding `70 / 20 / 108`, column gap 14.
- Profile: centered column, gap 12. Avatar 84 with a −8 blurred conic ring, 3px border in the background color; name 24/800; handle 13/600 mono at 0.38.
- Stat grid: 2 columns, gap 12, height 104, radius 26, padding 16, content bottom-aligned: value 26/800/−0.035em + caption 12/600.
- Group rows: radius 22, padding `12px 16px`, row gap 13: 10px accent dot with glow, name 15/700, right label mono 13/700 at 0.5 ("8h · 4").
- Settings rows: radius 22, padding `13px 16px`, `space-between`. Toggle 42×26, knob 20, fill `gradients.violetToBlue`.

**Components.** `Avatar`, `PersonalLimitCard` (stat variant), `StatusPill`, `BottomNavigation`.

**Scroll.** `ScrollView` when the member has more than 3 groups or more settings rows are added.

**Data.** Nickname, handle, weekly average, under-limit streak, groups with shared limit + member count + accent, personal daily limit, notification toggle.

**Interaction.** Tap avatar → edit profile (stub). Tap group row → Group Detail. Tap "My daily limit" → limit picker. Toggle → notification permission (deep-links to Settings if OS permission is off).

**States.** Loading: skeleton avatar + two stat skeletons. Error: values render as "—" with a retry row. Permission off: a `PermissionCTA` block appears directly under the stat grid, using the same copy as Today.

---

## 5. Group Detail

**Purpose.** Everything about one group today: the shared pool, who used what, and my own limit — in that order.

**Information hierarchy.** Our remaining time → per-member ranking → my personal limit.

**Structure.**
```
SafeArea
 ├ NavBar (back · group pill · more)
 ├ SharedOrbitHero (segmented orbit + big numbers side by side)
 ├ SectionTitle ("Today's ranking" + "덜 쓴 순서")
 ├ MemberCard (rank 1, highlighted)
 ├ RankingItem × (n − 1)
 └ PersonalLimitCard
```

**Exact layout.**
- Content padding `62 / 20 / 24`, column gap 10. No bottom nav (pushed screen).
- Nav bar: 38px circular back, centered group `StatusPill`, 38px "more" (three 3px dots).
- Hero: radius 32, padding 18, height ≈ 256. Row: 158px orbit (left) + text column (right, gap 4): "Left together" 13/600 muted → 40/800/−0.045em remaining → "of 8h shared today" 13/600 → 6px progress bar + "4 members sharing" 11/600.
- Orbit center: used total 20/800 + "USED" 10/700 mono.
- Ranking: rank-1 `MemberCard` (radius 24, padding `14px 16px`), then `RankingItem` list gap 7.
- Personal limit card at the bottom, margin-top 2.
- Total ≈ 750 of 758 available for 4 members. For 5+ members the content becomes a `ScrollView`.

**Components.** `SharedOrbitRing` (segmented), `MemberCard`, `RankingItem`, `RankingBadge`, `PersonalLimitCard`, `StatusPill`, `Avatar`.

**Scroll.** Static up to 4 members; `ScrollView` beyond that. The hero may collapse on scroll (optional, see `MOTION_SPEC` §8).

**Data.** Group name, accent, shared limit, used, remaining, per-member usage and sync age, my limit/used/streak.

**Interaction.** Back → previous screen. More → group settings (stub). Tap a member row → that member's detail (stub). Tap the amber sync dot → "Nudge" action.

**States.** Loading: orbit track only + skeleton rows. Empty (group with one member): ranking replaced by `EmptyState` "친구를 초대하면 순위가 시작돼요". Error: keep last known values, amber retry pill in the hero footer. Stale member: amber dot + "synced 38m ago"; the hero's percentage label gets a `~` prefix.
