# TODAY_STATE_SPEC

Eight states of **one** screen. The layout never changes: header → hero → section title → group grid → nav. What changes is light: bloom color and position, gauge gradient and sweep, pill tone, the number itself, and the dot texture density. Never a new component, never a rearranged stack (the two exceptions are explicit below: G adds a sync row inside the hero, H replaces the hero's footer with a `PermissionCTA`).

`used = usedMinutes / limitMinutes`. Sweep degrees = `min(used, 1) * 360`.

---

## A · Fresh Day

- **Trigger.** `used < 0.05` and the pool has been reset today.
- **Copy.** Greeting "Good morning, Jungwon" / subline "A whole day of real life ahead." Hero number `8h 00m`, sublabel "of 8h shared today", chip `0% USED`, footer "Updated just now" / "4 members ready".
- **Gauge.** Track only, plus a 5–8° cyan tick at 12 o'clock so the ring reads as started, not broken.
- **Gradient.** `#22D3EE` tick on `rgba(255,255,255,0.05)` track.
- **Glow.** Screen bloom cyan `rgba(34,211,238,0.24)` top-right. Hero bloom cyan `rgba(34,211,238,0.40)` top-center. Lowest overall luminance of any state.
- **Text.** Number `text.primary`; chip `accent.cyanSoft`.
- **Metadata.** Sync label; member-ready count instead of a per-member usage line.
- **CTA.** None.
- **Transition in.** On midnight reset: the arc sweeps to 0 over `motion.duration.orbit` and the bloom crossfades violet → cyan over `stateChange`.

## B · Normal (approved default)

- **Trigger.** `0.05 ≤ used < 0.70`.
- **Copy.** "Let's keep some time for real life." Number `3h 42m`, chip `54% USED`, footer "Updated 2m ago" + "민지 · 1h 04m" with a blue dot.
- **Gauge.** Continuous arc, sweep = used × 360 (194° at 54%).
- **Gradient.** `gradients.sharedPool` — violet → blue → cyan, conic from −90°.
- **Glow.** Screen bloom violet `rgba(124,77,255,0.32)` top-left. Hero bloom violet→blue `rgba(124,77,255,0.50)` top-center + cyan `0.30` bottom-right. Arc glow = blurred duplicate at 0.85.
- **Text.** Chip `accent.cyan`.
- **CTA.** None.
- **Transition.** Arc and number animate on every sync; see `MOTION_SPEC` §1.

## C · 75% Used

- **Trigger.** `0.70 ≤ used < 0.88`.
- **Copy.** "우리 시간이 조금 남았어요." Number `2h 00m`, chip `75% USED`, footer right "2시간 남음".
- **Gauge.** Sweep 270°. Cyan drops out of the gradient — the arc is violet end to end.
- **Gradient.** `gradients.tightening` (#7C4DFF → #8B5CF6 → #A78BFA).
- **Glow.** Hero bloom moves up and grows: `rgba(139,92,246,0.62)`, blur 26, positioned −90px above the card top. Hero surface warms to `linear-gradient(165deg,#191227,#0A0A11 62%)`, border `rgba(167,139,250,0.16)`. Group pill switches from glass to violet tone.
- **Text.** Chip and footer right in `accent.violetPale`.
- **CTA.** None. No warning icon, no banner — the room simply gets more violet.

## D · 90% Used

- **Trigger.** `0.88 ≤ used < 1.0`.
- **Copy.** "오늘 남은 시간이 얼마 없어요." Number `48m`, chip `90% USED`, footer right "같이 아껴봐요".
- **Gauge.** Sweep 324°. Violet → magenta.
- **Gradient.** `gradients.approaching` (#7C4DFF → #D946EF → #F0ABFC).
- **Glow.** Hero bloom `rgba(217,70,239,0.50)`, blur 26; arc glow blur 15 with a 4.5s breathing loop (`motion.loop.approachingPulseMs`). Surface `linear-gradient(165deg,#1D1128,#0B0910 62%)`, border `rgba(240,171,252,0.18)`. Screen bloom `rgba(192,132,252,0.42)`.
- **Text.** Chip `state.approaching`; footer right `#F5D0FE`. The number stays white — the light carries the urgency, not the type.
- **CTA.** None. Do not introduce alarm affordances.

## E · Limit Reached

- **Trigger.** `used ≥ 1.0` and `overMinutes === 0`.
- **Copy.** Greeting replaced by "오늘 몫은 다 썼어요" / "내일 8시간이 다시 채워져요." Number `0m`, sublabel "8h shared, all used", chip `POOL COMPLETE`, footer "Resets at midnight".
- **Gauge.** Full ring at 55% opacity, four-stop sweep (violet → blue → cyan → violet). No bright arc tip.
- **Glow.** The bloom moves **below** the ring (`bottom: −110px`, violet 0.40) so the light sinks rather than flares. Inner 128px radial pulse at 7s. Dot texture switches to `dotTexture.calm` (22px, 4.5%).
- **Text.** Chip `state.complete` (#E9D5FF).
- **CTA.** Secondary pill "Wrap up today" in the footer right (glass tone). Never framed as failure.

## F · Over Limit

- **Trigger.** `overMinutes > 0`.
- **Copy.** Greeting "42분 초과했어요" / "내일은 조금 더 여유롭게." Number `42m over` in `state.overLimit`, chip `108% USED`, footer right "내일 리셋까지 12분".
- **Gauge.** Base ring full at 60% opacity, plus a **separate outer arc** at 88% mask radius carrying the overshoot (sweep = `(used − 1) × 360`, capped at 60°), pink with a soft shadow.
- **Gradient.** Base violet → magenta → pink; overshoot `gradients.overLimit`.
- **Glow.** Hero bloom pink `rgba(244,114,182,0.40)`; screen bloom pink 0.30 top-right. Background stays black — no red wash, no full-screen tint.
- **Text.** Number and chip in `state.overLimit`. This is the only state where the hero number is not white.
- **CTA.** None.

## G · Sync Issue

- **Trigger.** Any member's `lastSyncedAt` is older than 30 minutes while the pool is active.
- **Copy.** Subline "한 명의 기록이 조금 늦어요." Number unchanged for the state it sits in, chip prefixed `~` (e.g. `~54% USED`), gauge sublabel replaced by "may be less" in `rgba(252,211,77,0.80)`.
- **Gauge.** The underlying state's arc, unchanged, plus a **dashed amber circle** at 168px (outside the 150px ring) at `rgba(252,211,77,0.40)`.
- **Glow.** Unchanged from the underlying state. No amber bloom.
- **Extra element.** A single sync row inside the hero, below the gauge: radius 16, padding `10px 12px`, fill `rgba(252,211,77,0.08)`, border `rgba(252,211,77,0.20)`, 26px avatar + "민지 · synced 38m ago" + a "Nudge" pill. The gauge box shrinks 178 → 166 to make room; nothing else moves.
- **CTA.** "Nudge" (sends a notification, no navigation).
- **Note.** Composable with B–F. Never with A (no data yet) or H.

## H · Screen Time Permission Off

- **Trigger.** OS Screen Time authorization is not granted for this device.
- **Copy.** Subline "아직 우리 시간에 참여하지 못했어요." Gauge center `— —` with "Screen Time 권한 필요", chip `NO DATA`. Body "권한을 켜면 내 사용 시간이 밤샘 금지단의 공동 시간에 합산돼요."
- **Gauge.** Flat grey track only (`rgba(255,255,255,0.06)`), 146px, no arc, no glow, no avatars.
- **Glow.** None on the hero. No screen bloom. Dot texture `dotTexture.calm`.
- **Text.** Gauge number `rgba(255,255,255,0.35)`; pill text 0.6; the avatar in the header desaturates to a flat `rgba(255,255,255,0.10)` disc.
- **CTA.** `PermissionCTA` replaces the hero footer: primary "Screen Time 권한 켜기" (`gradients.violetToBlue`, the only saturated element on the screen) + secondary "나중에".
- **Recovery.** Identical CTA appears in MY. On grant, animate to the live state with the transition in `MOTION_SPEC` §2.

---

## State machine

```
        midnight reset
             ↓
A Fresh ──► B Normal ──► C 75% ──► D 90% ──► E Reached ──► F Over
   ▲            │                                             │
   └────────────┴─────────────── midnight reset ──────────────┘

G Sync Issue   = overlay on B–F (dashed ring + sync row)
H Permission   = replaces the hero content entirely; exits to the live state on grant
```

Thresholds live in one place:

```ts
export function poolState(used: number, over: number, opts: { permission: boolean; stale: boolean }) {
  if (!opts.permission) return 'permissionOff';
  if (over > 0) return 'over';
  if (used >= 1) return 'complete';
  if (used >= 0.88) return 'approaching';
  if (used >= 0.70) return 'tightening';
  if (used < 0.05) return 'fresh';
  return 'normal';
}
```
