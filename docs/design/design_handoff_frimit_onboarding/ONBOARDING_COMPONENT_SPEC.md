# ONBOARDING_COMPONENT_SPEC

## Reused from the Core handoff — do not redefine

These are specified in `design_handoff_frimit_core/COMPONENT_SPEC.md` and used here unchanged:

| Component | Onboarding usage |
| --- | --- |
| `SharedOrbitRing` | 01, 07 (mini), 08, 10, 12, 14, 15, 16 — new sizes only, no new variants beyond `empty` and the seat overlay |
| `Avatar` | Everywhere. New `ring="pending"` usage is already in the core spec |
| `AvatarStack` | Not used in onboarding (the orbit replaces it) |
| `StatusPill` | Group pills on 08, 11, 14; the readiness chips on 13 |
| `ProgressBar` | Ready-count bar (13), time-range bar (09) |
| `GradientButton` | Every primary CTA |
| `PermissionCTA` | 16, and MY's recovery row |
| `EmptyState` | Expired invite (08), full group (08) |
| `BottomNavigation` | 16 only |
| Tokens | `DESIGN_TOKENS.ts` in the core package — no token is redefined here |

Only the components below are new.

---

## 1. StepProgress

**Purpose.** Three-dash progress marker on 03 / 04 / 05.

```ts
interface StepProgressProps { total: number; current: number; }  // 1-indexed
```

**Layout.** Row, gap 6. Each dash 22 × 4, radius 2. Completed and current: `gradients.violetToBlue` (the third step uses `blue → cyan`). Upcoming: `rgba(255,255,255,0.12)`.

**Notes.** Purely decorative — never tappable. Screens 06+ drop it and use a mono `STEP 3 OF 3` / `2 / 2` label instead; keep that distinction.

---

## 2. ChoiceCard

**Purpose.** The two unequal options on 07.

```ts
interface ChoiceCardProps {
  title: string; caption: string;
  emphasis: 'primary' | 'secondary';
  figure: React.ReactNode;      // mini-orbit or code boxes
  accent: 'violet' | 'cyan';
  onPress: () => void;
}
```

**Layout.** Radius 30, padding 22, `justifyContent: 'space-between'`. Primary height 250, secondary 210. Figure at the top, text at the bottom: title 24/800 (secondary 22/800), caption 14/500 at 0.5.

**Colors.** Primary: `linear-gradient(160deg,#16162A,#0A0A11)`, border `colors.border.violet`, glow `0 0 34px -14px rgba(124,77,255,0.9)`, bloom top-right 0.55. Secondary: flat `#0E1016`, `border.hairlineStrong`, cyan bloom bottom-left 0.30.

**States.** Press per `ONBOARDING_MOTION_SPEC` §8. Never make the two cards equal — the size and glow difference is the recommendation.

---

## 3. OrbitSeat

**Purpose.** One position on the orbit: a joined member, an empty seat, or an abstract light.

```ts
interface OrbitSeatProps {
  angleDeg: number;             // computed, never hard-coded
  radius: number;
  size: number;                 // 28–40 by screen
  state: 'filled' | 'glowing' | 'pending' | 'light';
  member?: Member;
  surfaceColor: string;         // for the 2px border
}
```

**Layout.** Absolutely positioned from the orbit center: `left = c + cos(θ)·r − size/2`, `top = c + sin(θ)·r − size/2`. All seats on one orbit share one radius.

**Variants.**
- `filled` — `Avatar`, 2px border in the surface color.
- `glowing` — same plus a colored shadow (iOS) or a static bloom (Android), `0 0 16–20px` in the avatar's own hue.
- `pending` — `rgba(255,255,255,0.05–0.06)` fill, **1px dashed** `rgba(255,255,255,0.24–0.28)` border, a `+` or the member's initial at 0.45.
- `light` — no avatar: a 10–16px disc in `#EDE9FE` / `#67E8F9` / `#93C5FD` / `#C4B5FD` with a `0 0 16–20px 5–6px` halo. Welcome only.

**Motion.** Enter and join sequences in `ONBOARDING_MOTION_SPEC` §3–4.

---

## 4. InviteCodeCard

**Purpose.** Display and copy the 6-digit invite code (screen 10).

```ts
interface InviteCodeCardProps { code: string; onCopy: () => void; copied?: boolean; }
```

**Layout.** Radius 24, padding 18, `surface.row`, `border.hairline`, centered column gap 10. Eyebrow `INVITE CODE` (`typography.eyebrow`, 0.32). Code at **30/800, JetBrains Mono, letterSpacing +8%**, color `accent.violetTint` (#DDD6FE).

**Format.** `FRM-XXXXXX`, uppercase, always rendered with the prefix; the entry field on 07 accepts the six digits alone.

**States.** `copied` — border flashes `accent.cyan` for 600ms and the eyebrow becomes "복사했어요" for 1.5s. Loading (code being minted): the code is replaced by a 180 × 30 shimmer block.

**Notes.** Long-press also copies. Do not use a system toast; the in-card feedback is the confirmation.

---

## 5. CodeEntryField

**Purpose.** Six-digit code entry on 07's join card.

```ts
interface CodeEntryFieldProps { value: string; onChange: (v: string) => void; error?: boolean; }
```

**Layout.** Row, gap 8. Six boxes 34 × 44, radius 12, fill `rgba(255,255,255,0.05)`.

**States.** Empty: border `border.hairlineStrong`. Filled: digit 18/800 mono in `accent.cyanSoft`, border `rgba(34,211,238,0.28)`. Focused (next box): border `rgba(34,211,238,0.28)` with a 1px caret. Error: border `state.overLimit`, shake per motion §8, caption "코드를 다시 확인해 주세요" 12/600 in `state.overLimit`.

**Notes.** One hidden `TextInput` (`keyboardType: 'number-pad'`, `textContentType: 'oneTimeCode'`, `maxLength: 6`) behind six presentational boxes. Validate on the sixth digit; do not require a submit button.

---

## 6. PermissionExplanation

**Purpose.** The repeated "here's why, here are examples" block on 04 and 11.

```ts
interface PermissionExplanationProps {
  title: string;                  // 30/800, up to two lines
  caption?: string;               // 14/500 muted
  samples: SampleRow[];           // 1–3
  note?: { title: string; body: string };   // dashed privacy card
}
interface SampleRow {
  leading: 'icon' | 'avatar' | 'tile';
  title: string; caption: string;
  emphasis?: boolean;             // first row only
}
```

**Layout.** Column gap 26 for the header block, 10 between sample rows. Row: radius 22, padding `14px 16px`, leading slot 34px (rounded square radius 11 for icons/tiles, circle for avatars), gap 12, title 13/700, caption 12/600 at 0.38.

**Colors.** Emphasised row: `linear-gradient(150deg,#14141F,#0A0A10)`, border `rgba(167,139,250,0.18)`, glow `0 0 26px -12px rgba(124,77,255,0.7)`. Others: `surface.row` + `border.subtle`.

**Notes.** At most one emphasised row per screen. The optional note renders as `PrivacyDisclosureCard` §7 in its dashed form.

---

## 7. PrivacyDisclosureCard

**Purpose.** The paired "can see / can't see" cards on 05, and the dashed privacy note on 11.

```ts
interface PrivacyDisclosureCardProps {
  tone: 'visible' | 'hidden';
  eyebrow: string;
  headline?: string;              // 32/800 — 'visible' only
  chips?: string[];               // 'visible' only
  rows?: { label: string; value: string }[];  // 'hidden' only
  note?: string;
}
```

**Layout.** Radius 26, padding 18, column gap 12. Eyebrow row: 6px dot + `typography.eyebrow`.

**Colors.** `visible`: surface `linear-gradient(160deg,#0C1418,#09090F)`, border `rgba(34,211,238,0.20)`, glow `0 0 30px -14px rgba(34,211,238,0.8)`, cyan dot, eyebrow `accent.cyanSoft`, headline `text.primary`. `hidden`: fill `rgba(255,255,255,0.025)`, **dashed** `border.dashed`, grey dot, eyebrow at 0.4, rows at `rgba(255,255,255,0.22)` 15/600 — deliberately hard to read, because that is the message.

**Notes.** The hidden rows are static example strings. Never render real user data here.

---

## 8. NumericTimeSelector

**Purpose.** Set the group's shared daily time on 09. The protagonist of that screen.

```ts
interface NumericTimeSelectorProps {
  valueMinutes: number;           // default 480
  min?: number;                   // 120
  max?: number;                   // 840
  step?: number;                  // 30
  memberCount?: number;           // for the per-person caption
  onChange: (minutes: number) => void;
}
```

**Layout.** Inside a radius-32 card (padding `24px 20px`, `gradients.heroSurface`, hero dot texture, violet bloom top). Column gap 18, centered:
1. Eyebrow `SHARED DAILY TIME`.
2. Row gap 22: 46px "–" circle (`surface.glass`, `border.hairlineStrong`, glyph 22/700 at 0.7) · value column (`8h` at **60/800/−0.05em**, caption 12/600 at 0.4) · 46px "+" circle (`gradients.violetToBlue`, glow `0 0 20px -4px`).
3. Full-width 6px range bar with the fill at `(value − min) / (max − min)` and three mono 11px labels: min, step, max.

**Formatting.** Whole hours render `8h`; half hours `8h 30m`. Caption: `${memberCount}명 기준 · 1인 ${perPerson}` where `perPerson` is rounded to the nearest 5 minutes.

**States.** At `min` the "–" drops to 0.35 and is disabled; at `max` the "+" loses its gradient (flat glass) and is disabled. Long-press repeats at 150ms. Motion per §8 of the motion spec.

**Notes.** Do not substitute a slider or a dial — accuracy matters and the big numeral is the point. A slider may accompany the bar later, but the ± control is the committed design.

---

## 9. AccentPicker

**Purpose.** Choose the group's accent identity on 09.

```ts
interface AccentPickerProps { value: GroupAccentKey; onChange: (k: GroupAccentKey) => void; }
```

**Layout.** Row of three, `flex: 1` each, height 56, radius 18, gap 10. Fill = that accent's `from → to` at 120°.

**States.** Selected: full opacity, 2px `accent.violetPale` border, glow `0 0 22px -6px` in the accent. Unselected: `opacity.unselectedSwatch` (0.55), no border.

**Notes.** The three options are exactly the design system's group accents (violet, cyan, pink). No custom colors, no color picker.

---

## 10. ReadinessRow

**Purpose.** One member's setup state on 13.

```ts
interface ReadinessRowProps {
  member: Member;
  state: 'ready' | 'self-ready' | 'pending';
  chips?: string[];               // self only: '✓ Screen Time', '✓ 6 apps'
  pendingReason?: string;         // 'Waiting for Screen Time'
  onNudge?: () => void;
  nudgeDisabled?: boolean;
}
```

**Layout.** Radius 24, padding 16, row gap 13, list gap 10. Avatar 44 (activity ring on `self-ready`, soft ring on `ready`, flat disc at 0.45 on `pending`). Middle column gap 5. Right: `Ready` 13/700 in `accent.cyanSoft`, or a `Nudge` pill (padding `7px 13px`, amber tones).

**Colors.** `self-ready`: `linear-gradient(150deg,#151029,#0B0B12)`, `border.violet`, glow `0 0 28px -14px rgba(124,77,255,0.9)`. `ready`: `surface.row` + `border.subtle`. `pending`: `rgba(255,255,255,0.02)` + dashed `border.dashed`, name at 0.6, reason 12/600 in `rgba(252,211,77,0.75)`.

**States.** Nudge disabled for 60s after use (pill at 0.4, non-interactive). Rows re-sort as members become ready.

**Notes.** Chips only ever appear on the current user's row — never enumerate another member's setup details.

---

## 11. SelectionResult

**Purpose.** The count that comes back from the system picker (12).

```ts
interface SelectionResultProps { count: number; groupName: string; }
```

**Layout.** 190px ring (full 4-stop sweep at 0.8, mask 86%, inner cyan bloom blur 12), center column: count at **64/800/−0.05em**, label `apps in this pool` 13/600 at 0.45. Below, a centered 14/500 caption at 0.44, two lines.

**States.** `count === 0`: ring shows the track only, number is `0` at 0.4, caption becomes "앱을 하나 이상 골라야 시작할 수 있어요", and the primary CTA becomes `Choose apps`.

**Notes.** Never list the selected apps here, even when the platform makes them readable. The count is the whole point.

---

## 12. WaitingRoomHero

**Purpose.** The gathering space on 14 — a composition, not a new primitive.

```ts
interface WaitingRoomHeroProps {
  limitMinutes: number;
  members: (Member & { ready: boolean })[];
  size?: number;                  // 280
}
```

**Composition.** `SharedOrbitRing` (arc at the ready fraction, blurred duplicate breathing at 7s) + `OrbitSeat` per member (`glowing` when ready, `pending` otherwise) + a center column (`8h` at 56/800, `shared every day` 13/600).

**Notes.** This exists so 14 and 15 don't each hand-roll orbit composition. Screen 15 uses the same component at size 300 with every seat `glowing` and the arc at the pool's real value.
