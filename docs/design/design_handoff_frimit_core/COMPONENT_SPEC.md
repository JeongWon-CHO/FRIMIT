# COMPONENT_SPEC

All tokens referenced as `tokens.<group>.<name>` from `DESIGN_TOKENS.ts`. Sizes in px at a 390pt-wide reference screen; scale with the screen width only where noted.

Shared rules for every component:
- Surfaces are opaque. Depth comes from surface contrast, a hairline border and one bloom — not from shadows.
- Only one bloom layer per card, and at most two per screen.
- Text never uses pure white; use the `tokens.colors.text` ramp.
- Pressable surfaces animate per `tokens.motion.press`.

---

## 1. SharedPoolHero

**Purpose.** The Today hero. Shows one group's remaining shared time for today. The single most important element in the app.

```ts
interface SharedPoolHeroProps {
  groupName: string;
  accent: GroupAccentKey;          // 'violet' | 'cyan' | 'pink'
  limitMinutes: number;            // e.g. 480
  usedMinutes: number;             // e.g. 258
  members: Member[];               // 2–8, used for the orbit avatars
  state: PoolState;                // see TODAY_STATE_SPEC
  lastSyncedLabel: string;         // "Updated 2m ago"
  footerRight?: React.ReactNode;   // "민지 · 1h 04m" + dot
  onPress?: () => void;            // → Group Detail
}
```

**Variants.** `fresh | normal | tightening | approaching | complete | over | staleSync | permissionOff` (drives gradient, bloom, gauge, copy — see `TODAY_STATE_SPEC.md`).

**Layout.** Full width minus `spacing.screenHorizontal` × 2. Padding `20px 20px 16px`. Radius `radius.heroCard` (32). Internal stack: pill row (30px) → gauge box (`layout.heroGaugeBoxHeight` 178) → footer row (12px top padding + 1px top border `colors.border.subtle`). Gauge 162px centered; member avatars 32px on the ring.

**Typography.** Remaining time `typography.heroNumberSm` (36) in the gauge center; sublabel `typography.metadata`; the "54% USED" chip `typography.numericLabel` in `state` color; group pill `typography.bodyStrong` 13.

**Colors / gradient / glow.** Surface `gradients.heroSurfaceToday`. Dot texture `dotTexture.heroCard`. Bloom `glow.hero` top-center + `glow.heroCyan` bottom-right. Arc gradient per state.

**States.** normal · pressed (`scale 0.985`) · loading (gauge track only, number replaced by a 96×28 shimmer block) · staleSync (dashed amber ring + "may be less") · permissionOff (grey track, no bloom, `— —`).

**Implementation notes.** Compose `SharedOrbitRing` + text; don't reimplement the arc. Keep the bloom as one absolutely-positioned `RadialGradient` `<Svg>`, `pointerEvents="none"`.

---

## 2. SharedOrbitRing

**Purpose.** The signature gauge. Full geometry and math in `SHARED_ORBIT_SPEC.md`.

```ts
interface SharedOrbitRingProps {
  size: number;                    // 162 (Today), 158 (Group Detail), 250–300 (celebration)
  progress: number;                // 0..1, may exceed 1 for over-limit
  segments?: { memberId: string; value: number }[]; // per-member arcs (Group Detail)
  gradient: readonly string[];     // from tokens.gradients
  members?: Member[];              // avatars placed on the ring
  showTrackDashes?: boolean;       // outer dashed circle
  glowIntensity?: 'none' | 'soft' | 'strong';
  children?: React.ReactNode;      // center content
}
```

**Variants.** `continuous` (Today: one gradient arc) · `segmented` (Group Detail: one arc per member, separated by a 2° black gap) · `complete` (full ring at 55–60% opacity) · `overshoot` (full ring + a thin outer pink arc) · `empty` (track only).

**Layout.** Stroke = `size * borders.orbitStrokeRatio` (0.18) ≈ 14.6px at 162. Arc starts at −90° (12 o'clock), runs clockwise. Avatars sit centered on the stroke radius (`(size − stroke) / 2` from center) — every avatar at the same radius, no ad-hoc offsets.

**Colors / glow.** Track `rgba(255,255,255,0.055)`. Arc from the state gradient. `soft` glow = a second, blurred copy of the arc at 0.85 opacity (in RN: a duplicate `Circle` with a wider stroke and low opacity, see notes).

**Implementation notes.** `react-native-svg` `<Circle>` with `strokeDasharray={C}` and `strokeDashoffset={C * (1 - progress)}`, `strokeLinecap="round"` for continuous, `"butt"` for segmented. Animate only `strokeDashoffset` with Reanimated.

---

## 3. Avatar

**Purpose.** A member's presence. Used at seven sizes across the app.

```ts
interface AvatarProps {
  member: { id: string; name: string; photoUrl?: string; colorIndex: number };
  size: keyof typeof tokens.layout.avatar; // xl 96 | lg 46 | md 40 | sm 38 | xs 34 | xxs 28 | micro 26
  ring?: 'none' | 'activity' | 'achievement' | 'pending';
  borderColor?: string;            // matches the surface it sits on
  dimmed?: boolean;
}
```

**Variants.** photo · initial (fallback, first character of the nickname) · pending (dashed border, `rgba(255,255,255,0.06)` fill) · dimmed (opacity 0.85, limit-reached state).

**Layout.** Circle. Border `borders.avatarRingWidth` (2) in the **parent surface color**, so overlapping stacks read cleanly. Initial size ≈ 0.36 × avatar size, weight 700.

**Colors.** Fill from `gradients.avatarFills[colorIndex % 8]`, 150° linear. `activity` ring = `gradients.avatarRing` conic at `glow.avatarRing`. `achievement` ring = `gradients.achievementRing`.

**States.** normal · new-activity (ring) · rank-1 (achievement ring + 👑 at top-right, offset −8/−6) · pending · dimmed.

**Implementation notes.** Conic gradients don't exist in RN. Render the ring as an `<Svg>` circle with a `SweepGradient`-like 4-stop approximation, or ship a 2× PNG ring per variant (see `ASSET_MANIFEST.md`). The 👑 is a text emoji, size ≈ 0.3 × avatar.

---

## 4. AvatarStack

**Purpose.** Compact "these people share this" indicator on group cards.

```ts
interface AvatarStackProps {
  members: Member[];
  max?: number;                    // default 4
  size?: 'xxs' | 'xs' | 'micro';   // default micro (26)
  surfaceColor: string;            // for the avatar borders
}
```

**Layout.** Row, `marginLeft: tokens.layout.avatarStackOverlap` (−9) on every item after the first. Overflow chip has the same diameter, fill `rgba(255,255,255,0.10)`, label `+N` at 10–11px/700.

**Implementation notes.** Render in DOM order (first member on top-left, later members overlap to the right); on iOS set `zIndex` descending so the first stays on top.

---

## 5. GroupCard

**Purpose.** One group in the Today grid. Each card is its own small glowing object.

```ts
interface GroupCardProps {
  group: { id: string; name: string; accent: GroupAccentKey };
  remainingLabel: string;          // "3h 42m" | "42m over"
  isOver?: boolean;
  members: Member[];
  wide?: boolean;                  // spans both grid columns
  onPress: () => void;
}
```

**Variants.** `default` (2-col, 124px tall) · `wide` (full width, 88px, avatars on the right) · `over` (number in `state.overLimit`, pink bloom).

**Layout.** Radius `radius.groupCard` (26). Padding 14 (wide: 14/18). Grid gap 12. Default card: `AvatarStack` top-left, number + name bottom-left, `justifyContent: space-between`. Wide card: number + name left, `AvatarStack` right, `alignItems: center`.

**Typography.** Number `typography.cardNumber` (22/800/−0.66). Name 13/600 in `text.muted`.

**Colors / glow.** Surface from `colors.groupAccent[accent].surface`. One bloom per card using the accent bloom color, positioned differently per accent (violet top-left, cyan bottom-right, pink top-center) so the grid doesn't look stamped.

**States.** normal · pressed · loading (skeleton bar 80×22 + 100×13) · over.

---

## 6. MemberCard

**Purpose.** One member as a small digital object — used in Group Detail rank 1 and in readiness lists.

```ts
interface MemberCardProps {
  member: Member;
  usageLabel: string;              // "42m"
  rank?: number;
  badge?: string;                  // "LEAST TODAY"
  syncLabel: string;               // "synced 2m ago"
  syncState: 'fresh' | 'stale';
  highlighted?: boolean;           // rank 1
}
```

**Layout.** Radius 24, padding `14px 16px`, row with gap 13. Avatar `lg` (46) when highlighted, `sm` (38) otherwise. Right column right-aligned: usage `typography.cardNumber` 24, caption 11/700 in `accent.violetPale`.

**Colors / glow.** Highlighted: surface `linear-gradient(150deg, #161029, #0B0B12)`, border `colors.border.violet`, glow `0 0 28px -8px rgba(124,77,255,0.5)` (RN: static bloom + border, no shadow spread). Otherwise `surface.row` + `border.subtle`.

**Implementation notes.** Only one highlighted member card per screen.

---

## 7. RankingItem

**Purpose.** Ranks 2..n in Group Detail. Friendly, never punitive.

```ts
interface RankingItemProps {
  rank: number;
  member: Member;
  usageLabel: string;
  syncLabel: string;
  syncState: 'fresh' | 'stale';
}
```

**Layout.** Radius `radius.listRow` (22), padding `12px 15px`, row gap 12, list gap 7. Rank numeral 22px wide, mono 13/800 in `rgba(255,255,255,0.40)`. Avatar `sm` (38). Usage `typography.memberNumber` (19).

**Colors.** Identical neutral surface for every rank below 1 — no red, no descending color ramp, no "worst" treatment. Stale sync adds a 5px amber dot + `rgba(252,211,77,0.75)` caption.

---

## 8. RankingBadge

**Purpose.** The positive reward on rank 1.

**Variants.** `crown` (👑 emoji, top-right of the avatar) · `label` (pill "LEAST TODAY", `state.achievement` text on `rgba(253,230,138,0.12)`, border `rgba(253,230,138,0.28)`) · `ring` (achievement ring on the avatar).

**Implementation notes.** All three appear together on rank 1 and nowhere else. Never show a badge for the last place.

---

## 9. PersonalLimitCard

**Purpose.** My own limit. Deliberately secondary to the shared pool — smaller type, no bloom.

```ts
interface PersonalLimitCardProps {
  limitMinutes: number;   // 150
  usedMinutes: number;    // 102
  streakDays: number;     // 12
}
```

**Layout.** Radius 22, padding `14px 16px`, column gap 9. Rows: eyebrow + "48m left" · 5px progress bar · "Used 1h 42m" + "12 days under limit".

**Typography.** Eyebrow `typography.eyebrow` at 0.30 opacity. Values 12/700.

**Colors.** Surface `rgba(255,255,255,0.03)`, bar fill `gradients.violetToBlue`, no glow. If this card ever out-glows the hero, it is wrong.

---

## 10. GoalCard

**Purpose.** A shared goal with group progress and per-member progress.

```ts
interface GoalCardProps {
  title: string;                   // "이번 주 5번 운동하기"
  groupName: string;
  deadlineLabel: string;           // "7 days left"
  progress: number;                // 0..1
  members: { member: Member; done: number; total: number }[];
  variant?: 'hero' | 'compact';
}
```

**Layout — hero.** Radius `radius.heroCard`, padding 22. Pill row → title (24/800) → percent (56/800/−0.05em) + caption → `ProgressBar` (12px, tip dot) → 1px divider → member rows (avatar 32 + name/count + 5px bar), row gap 14.

**Layout — compact.** 2-col, height 142, radius 26. Either a 56px mini ring with percent, or an `AvatarStack`, then title 15/800 + caption 12/600.

**Colors.** Hero surface `linear-gradient(160deg, #121223, #0A0A11 60%)`, bloom `rgba(99,102,241,0.5)` top-left. Compact cards use accent blooms as `GroupCard` does.

---

## 11. ActivityItem

**Purpose.** One event in the Activity stream. Small and clean, not a social feed post.

```ts
interface ActivityItemProps {
  kind: 'member' | 'pool' | 'goal' | 'nudge' | 'system';
  actors: Member[];                // 1, or 2 for a nudge
  text: React.ReactNode;           // may contain one bold span
  timeLabel: string;
  reactions?: { emoji: string; count: number }[];
  emphasis?: 'none' | 'violet';
}
```

**Layout.** Radius `radius.activityItem` (20), padding `10px 14px`, row gap 13, list gap 4. Leading slot 38px: avatar, two overlapped avatars (−14 for a nudge), or a 38px token tile (`rgba(...,0.12)` fill + accent border) for pool/system events. Text 14/600, time 12/600 metadata.

**Variants.** `default` (surface `rgba(255,255,255,0.032)`) · `violet` (pool milestone: `rgba(124,77,255,0.07)` + `rgba(167,139,250,0.14)` border) · with reaction chips (4px 10px pill, `white-space: nowrap` equivalent — in RN, `flexShrink: 0`).

**Implementation notes.** Day dividers ("TODAY", "YESTERDAY") are `typography.eyebrow` at 0.28 opacity, not part of this component.

---

## 12. StatusPill

**Purpose.** Group identity, state labels, badges.

```ts
interface StatusPillProps {
  label: string;
  dotColor?: string;               // adds a glowing 6–7px dot
  tone?: 'glass' | 'violet' | 'cyan' | 'amber' | 'pink' | 'gold';
  size?: 'sm' | 'md';
}
```

**Layout.** Radius 999, padding `7px 13px 7px 9px` with a dot, `6px 11px` without. Gap 7–8.

**Colors.** `glass` = `surface.glass` + `border.hairlineStrong`. Toned variants use `rgba(accent, 0.12)` fill + `rgba(accent, 0.26–0.28)` border + pale accent text.

**Implementation notes.** This is the only place `BlurView` is permitted (optional; the opaque fill is acceptable and cheaper).

---

## 13. ProgressBar

**Purpose.** Linear progress where a ring would be too heavy.

```ts
interface ProgressBarProps {
  progress: number;                // 0..1
  height?: 12 | 6 | 5;
  gradient?: readonly string[];
  tip?: boolean;                   // bright dot at the end
}
```

**Layout.** Track `rgba(255,255,255,0.06–0.07)`, radius 999. Fill = `gradients.sharedPool` unless overridden. `tip` is a 16–18px `#E0F2FE` disc centered on the fill's end with a cyan halo.

**Variants.** `hero` (12, tip, glow) · `group` (6, glow) · `member` (5, no glow).

---

## 14. BottomNavigation

**Purpose.** Today / Goals / Activity / MY.

```ts
interface BottomNavigationProps {
  active: 'today' | 'goals' | 'activity' | 'my';
  onChange: (tab: string) => void;
}
```

**Layout.** Height `layout.bottomNavHeight` (104) including safe-area inset, padding `14px 22px 0`, items `space-between`, each item `9px 18px`, icon 18px, label 11px, gap 7.

**Colors.** Background = `gradients.navScrim` (opaque at the bottom). Selected item: pill radius `radius.navPill` (20), fill `rgba(accent,0.16)`, border `rgba(accentSoft,0.28)`, shadow `glow.navActive`, label in the accent tint. Unselected: no surface, content at `opacity.navInactive`.

**Icons.** Today = 18px rounded square with `gradients.violetToBlue`; Goals = 18px ring; Activity = three bars 3×9/16/12 with 3px gap; MY = 18px disc. Selected icons take the tab accent (Today violet, Goals blue, Activity cyan, MY violet-soft).

**Implementation notes.** The nav is fixed; screens reserve `spacing.contentBottom` (108) at the bottom of their scroll content. Hit targets are ≥44px tall.

---

## 15. PermissionCTA

**Purpose.** Recover Screen Time permission without pressure.

```ts
interface PermissionCTAProps {
  bodyText: string;
  primaryLabel: string;            // "Screen Time 권한 켜기"
  onPrimary: () => void;
  secondaryLabel?: string;         // "나중에"
  onSecondary?: () => void;
}
```

**Layout.** Sits inside the hero card slot. Body 13/600 at 0.5 opacity, line-height 1.5. Primary button: full width, padding 14, radius `radius.button`, `gradients.violetToBlue`, shadow `0 0 26px -4px rgba(99,102,241,0.7)`. Secondary: centered text 12/700 at 0.38.

**Colors.** In the permission-off state the violet gradient on this button is the **only** saturated color on screen. The gauge stays grey.

---

## 16. EmptyState

**Purpose.** No groups / no activity / no goals.

```ts
interface EmptyStateProps { title: string; body: string; action?: React.ReactNode; }
```

**Layout.** Radius 22, padding `24px 16px`, dashed border `border.dashed`, fill `rgba(255,255,255,0.025)`, centered column gap 10. A 52px dashed circle stands in for the missing object, then title 14/700, body 12/600 at 0.38, centered, line-height 1.6.

**Implementation notes.** No illustrations. The dashed circle echoes the orbit's empty seat.
