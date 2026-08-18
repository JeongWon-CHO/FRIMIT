# ONBOARDING_SCREEN_SPEC

Reference device 390 × 844. Tokens from `design_handoff_frimit_core/DESIGN_TOKENS.ts`.

**Shared frame rules for every onboarding screen (unless a screen overrides them):**
- Background `colors.background.base` #050507, dot texture 20px / 6% (calm 22px / 4.5% on trust and permission screens).
- Content padding `70 / 26 / 40`; in RN: `paddingTop = insets.top + 16`, `paddingBottom = max(insets.bottom, 24) + 16`.
- Root layout `flex: 1, justifyContent: 'space-between'` — a top block, an optional centered figure, and a bottom CTA block. This is what makes the sequence feel like one product rather than sixteen posters.
- At most one screen-level bloom, one card bloom.
- Primary CTA: full width, padding 16, radius `radius.button` (18), `gradients.violetToBlue`, shadow `0 0 30px -4px rgba(99,102,241,0.7)`, label `typography.buttonLarge` (16/800). Secondary: same box, `surface.glass` + `border.hairlineStrong`, 15/700 at 0.8. Tertiary: text only, 15/700 at 0.40, padding 12.
- No bottom navigation anywhere except screen 16.
- No screen scrolls at 390×844. Wrap each in a `ScrollView` with `contentContainerStyle={{ flexGrow: 1 }}` so small devices and large font settings degrade gracefully; screens 05, 09 and 13 are the first to overflow.

---

## 01 · Welcome

**Purpose.** One message: friends share one pool of time. Nothing else.

**Layout.** Top: wordmark "FRIMIT", mono 13, tracking .24em, 0.5 opacity. Center: 250px orbit — dashed outer circle, arc inset 16 with a near-full 4-stop sweep (mask 86%), one bright 16px `#EDE9FE` light at 12 o'clock (halo `0 0 20px 6px`), three 10px dim lights (cyan / blue / violet-pale) at 3, 6, 9 o'clock, all at radius 117. Bottom block gap 22: headline 38/800/−0.035em two lines ("Less screen. / More together."), subline 15/500 muted two lines, then CTAs gap 10.
Screen bloom: violet `rgba(124,77,255,0.40)` 440px, centered at y≈120.

**Components.** `SharedOrbitRing` (variant `empty` + custom light dots — see `OrbitSeat`), `GradientButton`.

**Copy.** `Less screen. / More together.` · `친구들과 하루 시간을 하나로 묶고 / 같이 아껴 쓰는 방법.` · CTA `Get started` · secondary `I have an invite`.

**Destination.** `Get started` → 02. `I have an invite` → code entry → 08.

**States.** No loading state (static). If a deep link is pending, skip straight to 08.

**Safe area / scroll.** Standard. No scroll.

---

## 02 · Sign in

**Purpose.** Authenticate without looking like a generic auth template.

**Layout.** Top: 38px circular back button; below it, 96px orbit mark (arc only, mask 84%, inner violet bloom blur 10) with `marginTop: 26`; then title 32/800 and body 15/500 muted, gap 10. Bottom: Apple button, Google button, legal line, gap 10.
Buttons: white `#FFFFFF` fill, radius 18, padding 16, label 16/700 in `#050507` (Apple) / `#1F1F1F` (Google), centered row gap 9. Google mark = 18px 4-quadrant disc. **No SF Symbols glyph** — Apple's button is text-only unless the official asset is used.
Screen bloom: violet 0.34, 380px, above the fold.

**Copy.** `시작해볼까요` · `계정으로 로그인하면 친구들과 / 같은 시간 풀에 연결돼요.` · `Continue with Apple` · `Continue with Google` · legal 12/600 at 0.34 with two 0.55-opacity link spans.

**Destination.** Success → 03. Existing account with groups → Today directly.

**States.** Pressed (buttons dim to 0.9); loading (label replaced by a 20px activity indicator in `#050507`, button stays white, disabled); error (a 13/600 line in `state.overLimit` above the buttons, no modal).

---

## 03 · Profile setup

**Purpose.** Nickname and a preset avatar; the user's light enters the space.

**Layout.** Top block gap 24: row with back button + `StepProgress` (3 dots, 22×4, radius 2, active `gradients.violetToBlue`, inactive `rgba(255,255,255,0.12)`, gap 6) → title 30/800 + caption 14/500 → **110px avatar preview** centered, with a −7 conic ring at blur 9 / 0.7 opacity breathing at 7s → nickname field → preset row. Bottom: primary CTA.
Nickname field: padding `16px 18px`, radius 18, fill `rgba(255,255,255,0.05)`, border `rgba(167,139,250,0.30)`, glow `0 0 22px -8px rgba(124,77,255,0.6)` when focused, value 17/700, 2px violet caret.
Preset row: five 52px discs, gap 11, `gradients.avatarFills[0..4]`; selected has a 2px `accent.violetSoft` border + `0 0 20px -4px` glow, unselected at `opacity.unselectedSwatch` (0.55–0.8).

**Copy.** `어떻게 불러드릴까요?` · `친구들에게 보이는 이름과 아바타예요.` · `NICKNAME` · `PRESET AVATAR` · `Continue`.

**Destination.** → 04.

**States.** CTA disabled (opacity 0.4, no shadow) until the nickname is 1–12 characters. Validation: trim, reject empty and duplicates within a group at join time, not here. Selecting an avatar animates the preview per `ONBOARDING_MOTION_SPEC` §2.

**Scroll.** Wrap in `ScrollView`; the keyboard must not cover the field (`KeyboardAvoidingView`, behavior `padding` on iOS).

---

## 04 · Notification intro (pre-permission)

**Purpose.** Explain why notifications exist before the OS asks.

**Layout.** Top block gap 26: `StepProgress` (2 of 3) → title 30/800 two lines → caption 14/500 → three sample notification rows, gap 10. Bottom: primary + tertiary, gap 10.
Row 1 (highlighted): radius 22, padding `14px 16px`, surface `linear-gradient(150deg,#14141F,#0A0A10)`, border `rgba(167,139,250,0.18)`, glow `0 0 26px -12px rgba(124,77,255,0.7)`, 34px rounded-square icon (radius 11) in `gradients.violetToBlue`. Rows 2–3: `surface.row` + `border.subtle`, 34px avatar or tinted tile. Title 13/700, caption 12/600 at 0.38.

**Copy.** `우리 시간이 얼마 남았는지 / 놓치지 않도록` · `중요한 순간에만 알려드려요. 하루에 몇 번이면 충분해요.` · rows: `밤샘 금지단 · 75% 사용 / 2시간 남았어요`, `도형이가 콕 찔렀어요 👀 / 방금`, `목표 진행 64% / 이번 주 5번 운동하기` · CTA `Turn on notifications` · tertiary `Not now`.

**Destination.** Both paths → 05. The OS sheet appears over this screen (see `PERMISSION_FLOW_SPEC`).

**States.** After the OS sheet resolves, no success screen — advance immediately. If denied, remember and offer re-enable in MY.

---

## 05 · Screen Time privacy intro

**Purpose.** Show exactly what friends see and what they never see. The trust screen.

**Layout.** Top block gap 22: `StepProgress` (3 of 3) → title 30/800 two lines → caption 14/500 → **"Friends can see" card** → **"Friends can't see" card**. Bottom: primary CTA.
See-card: radius 26, padding 18, surface `linear-gradient(160deg,#0C1418,#09090F)`, border `rgba(34,211,238,0.20)`, glow `0 0 30px -14px rgba(34,211,238,0.8)`; eyebrow with a cyan dot; value **32/800/−0.04em** `1h 42m used`; two glass pills.
Can't-see card: radius 26, padding 18, fill `rgba(255,255,255,0.025)`, **dashed** border `border.dashed`, three rows of app name + duration at 15/600 in `rgba(255,255,255,0.22)`, then a 12/600 note at 0.34.

**Copy.** `시간만 공유하고 / 목록은 남기지 않아요` · `공동 시간을 계산하려면 Screen Time 데이터가 필요해요.` · `FRIENDS CAN SEE` / `1h 42m used` / `6 apps counted` / `synced 2m ago` · `FRIENDS CAN'T SEE` / `Instagram 48m` / `YouTube 32m` / `KakaoTalk 22m` / `앱별 상세 기록은 이 기기에만 남아요.` · CTA `Continue`.

**Destination.** → 06.

**States.** Static. The three app names are illustrative placeholders — keep them literal, do not populate with the user's real apps (that would defeat the point of the screen).

**Scroll.** First screen at risk of overflow with large text; `ScrollView` required.

---

## 06 · Screen Time permission (not requested)

**Purpose.** The last step before the OS sheet.

**Layout.** Top: mono eyebrow `STEP 3 OF 3`. Center: **170px orbit**, grey track (`rgba(255,255,255,0.06)`, mask 84%) with a 40° violet→blue hint arc, center `— —` 30/800 at 0.4 + `NO DATA YET` mono 11. Then a centered text block gap 10: title 28/800, body 14/500 muted. Bottom: primary, tertiary, plus a 12/600 note at 0.30.
Dot texture: calm 22px. No bloom.

**Copy.** `마지막 한 단계` · `권한을 켜면 내 사용 시간이 그룹의 공동 시간에 합산돼요. 언제든 끌 수 있어요.` · `Enable Screen Time` · `Continue for now` · `다음 화면은 iOS / Android 시스템 시트예요.`

**Destination.** `Enable` → OS sheet → 06a (granted) or 06b (denied). `Continue for now` → 07.

---

## 06a · Permission approved (return state)

**Purpose.** A short confirmation, not a celebration screen.

**Layout.** 402px sheet-height block (in production: a full screen or a bottom sheet — the design is a centered column). Centered: 104px ring (full 4-stop sweep, mask 84%) with an inner cyan bloom pulsing at 6s and a 30px `✓` in `#CFFAFE`; title 26/800; caption 14/500 muted; secondary-style full-width `Continue`.

**Copy.** `You're connected.` · `이제 공동 시간에 참여할 수 있어요.` · `Continue`.

**Destination.** → 07 (or back to the origin screen when reached from Recovery — see §16).

**Timing.** Auto-advance after 1600ms if untouched; the button remains tappable.

---

## 06b · Permission denied (return state)

**Purpose.** Keep the door open without pressure.

**Layout.** Same block. 104px grey track ring with `— —` at 0.3; title 24/800; body 14/500 muted two lines; primary `Try again` + tertiary `Continue for now`. No bloom, calm dot texture.

**Copy.** `아직 참여 전이에요` · `둘러보는 건 괜찮아요. 공동 시간 집계는 권한을 켠 뒤부터 시작돼요.` · `Try again` · `Continue for now`.

**Destination.** `Try again` → OS sheet again (or Settings deep link if the OS will no longer prompt — see `PERMISSION_FLOW_SPEC` §4). `Continue for now` → 07.

---

## 07 · Create or Join

**Purpose.** The fork into the social half of onboarding. Two unequal objects, not two identical cards.

**Layout.** Top block gap 9: title 30/800 + caption 14/500. Center column `flex: 1`, `justifyContent: center`, gap 14:
- **Create card** — height 250, radius 30, surface `linear-gradient(160deg,#16162A,#0A0A11)`, border `colors.border.violet`, inner highlight + glow `0 0 34px -14px rgba(124,77,255,0.9)`, bloom top-right 0.55. Content: a 64px mini-orbit (dashed circle, 24px "정" avatar at the center, three 14px dashed seats at radius 32) then title 24/800 + caption 14/500 at 0.5.
- **Join card** — height 210, radius 30, surface `#0E1016`, border `border.hairlineStrong`, cyan bloom bottom-left 0.30. Content: six code boxes 34×44, radius 12, `rgba(255,255,255,0.05)` fill; box 1 filled `8` in cyan with a cyan border, box 2 dim `2`, rest empty; then title 22/800 + caption 14/500.

**Copy.** `혼자서는 시작할 수 없어요` · `공동 시간은 친구가 있어야 흘러요.` · `Create a group / Start a shared pool with friends` · `Join with invite / Enter a 6-digit code`.

**Destination.** Create → 09 (step 1). Join → code entry keyboard → 08 on a valid code.

**States.** Card press per `motion.press`. Invalid code: boxes shake 6px over 200ms, border turns `state.overLimit`, caption "코드를 다시 확인해 주세요".

**Skip rule.** Deep-linked invites bypass this screen entirely.

---

## 08 · Invitation preview

**Purpose.** Standing at the door of a group that already exists. One seat is visibly empty — the user's.

**Layout.** Top: inviter pill (22px avatar + "정원 invited you to", glass) then group name 34/800/−0.035em, centered. Center: **270px orbit** — dashed outer, arc inset 22 (mask 88%) 4-stop, inner bloom breathing 7s, center `8h` 44/800 + "shared every day" 12/600. Four 36px seats at radius 135: three filled avatars (정 with glow, 민, 도) and one **dashed empty seat** with a `+` in `accent.violetPale`. Bottom gap 14: status line (violet dot + text 14/700 at 0.55), primary CTA, tertiary.

**Copy.** `정원 invited you to` · `밤샘 금지단` · `8h / shared every day` · `3 friends waiting · 자리 하나가 비어 있어요` · `Join the group` · `먼저 둘러볼게요`.

**Destination.** `Join` → 11 (group settings already exist, so creation is skipped). `먼저 둘러볼게요` → Today in explore mode.

**States.** Loading (invite being fetched): orbit track only, group name as a 180×34 shimmer. Invalid/expired invite: replace the orbit with `EmptyState` "초대가 만료됐어요" + "코드로 참여하기". Group full: same pattern, "이 그룹은 자리가 다 찼어요".

**Motion.** On `Join`, the empty seat fills — see `ONBOARDING_MOTION_SPEC` §4.

---

## 09 · Create group

**Purpose.** Name, accent, and — as the protagonist of the screen — the shared daily time.

**Layout.** Two steps in one route with a `StepProgress`-style `2 / 2` marker.
Step 1 (top block gap 22): back + step marker row → `GROUP NAME` eyebrow + text field (padding `15px 18px`, radius 18, `rgba(255,255,255,0.05)`, 18/700) → `GROUP ACCENT` eyebrow + three 56px swatches in a row, gap 10, radius 18, selected has a 2px `accent.violetPale` border + accent glow, unselected `opacity 0.55`.
Step 2 (the hero of the screen): radius 32 card, padding `24px 20px`, surface `gradients.heroSurface`, hero-card dot texture, violet bloom top. Column gap 18, centered: eyebrow `SHARED DAILY TIME` → **`NumericTimeSelector`**: 46px "–" circle (glass) + `8h` at **60/800/−0.05em** with a 12/600 caption + 46px "+" circle (`gradients.violetToBlue`, glow) → a 6px progress bar showing the value's position in range with mono min/step/max labels.
Bottom: primary CTA.

**Copy.** `GROUP NAME` / `밤샘 금지단` · `GROUP ACCENT` · `SHARED DAILY TIME` / `8h` / `4명 기준 · 1인 2h` / `2h · 30m 단위 · 14h` · CTA `Create group`.

**Rules.** Range 2h–14h, step 30m. The caption recalculates as `total / memberCount` whenever the count is known; before anyone joins it reads against the expected size.

**Destination.** → 10.

**States.** CTA disabled until the name is non-empty. Long-press on − / + repeats at 150ms intervals. Creation in flight: CTA shows an activity indicator, inputs disabled.

**Scroll.** `ScrollView` + keyboard avoidance.

---

## 10 · Invite friends

**Purpose.** Hand out the code and watch the orbit start filling.

**Layout.** Top: title 30/800 + caption 14/500. Center: **250px orbit**, arc filled only to the joined fraction (90° for 1 of 4), center `8h` 40/800 + `1 of 4 joined` 12/600, four 34px seats at radius 125 — the creator filled and glowing, three dashed `+` seats. Bottom gap 12: `InviteCodeCard` (radius 24, padding 18, `surface.row`, centered, eyebrow + code at **30/800 mono, tracking .08em** in `accent.violetTint`), primary `Share invite`, secondary `Copy code`.

**Copy.** `친구를 불러요` · `한 명만 들어와도 공동 시간이 시작돼요.` · `INVITE CODE` / `FRM-824913` · `Share invite` · `Copy code`.

**Destination.** `Share invite` → OS share sheet, stays on this screen. Continuing (a friend joins, or the user taps through) → 11.

**States.** Copy tapped: card border flashes `accent.cyan` for 600ms, caption becomes "복사했어요". A friend joining animates a seat per `ONBOARDING_MOTION_SPEC` §4 — this screen listens to realtime updates and must not require a manual refresh.

---

## 11 · Tracking intro

**Purpose.** Explain per-group app selection and restate the privacy boundary, right before the system picker.

**Layout.** Top block gap 22: group `StatusPill` (self-aligned start) → title 30/800 two lines → caption 14/500 → category row (three 74px tiles, gap 10, radius 20; selected tile `rgba(124,77,255,0.10)` + `rgba(167,139,250,0.24)` border + `accent.violetPale` label) → privacy note card (radius 22, dashed border, `rgba(255,255,255,0.025)`, title 13/800 at 0.75 + body 12/600 at 0.38). Bottom: primary + a 12/600 note at 0.30.

**Copy.** `무엇을 이 시간에 / 포함할까요?` · `이 그룹의 공동 시간으로 셀 앱을 직접 고르세요. 그룹마다 다르게 정할 수 있어요.` · tiles `Social` `Video` `Games` · `Your selected app list stays on your phone.` / `친구들에게는 앱 개수와 총 시간만 보여요.` · CTA `Choose apps` · note `시스템 앱 선택 화면이 열려요.`

**Destination.** `Choose apps` → `FamilyActivityPicker` (iOS) / platform selection UI (Android) → 12.

**Note.** The category tiles are a preview of intent, not a functional selector — the real selection happens in the system picker. Do not build a custom app list.

---

## 12 · App selection result

**Purpose.** Confirm what came back from the system picker in Frimit's own language.

**Layout.** Top: mono eyebrow `BACK FROM SYSTEM PICKER` (production copy: the group name pill). Center column gap 20: **190px ring** (full 4-stop sweep at 0.8, mask 86%, inner cyan bloom) with center `6` at **64/800/−0.05em** and `apps in this pool` 13/600; then a centered 14/500 caption two lines. Bottom: primary + secondary, gap 10.

**Copy.** `6 / apps in this pool` · `고른 앱을 쓰는 시간만 / 밤샘 금지단의 공동 시간에 더해져요.` · `Looks good` · `Change selection`.

**Destination.** `Looks good` → 13. `Change selection` → reopen the system picker.

**States.** Zero apps selected: number reads `0`, ring shows track only, caption becomes "앱을 하나 이상 골라야 시작할 수 있어요", primary is replaced by `Choose apps`.

---

## 13 · Member readiness

**Purpose.** Show who is ready without turning it into a checklist.

**Layout.** Top block gap 8: group name 30/800 → a row with `3 of 4 ready` 14/700 in `accent.violetPale` + a 5px progress bar (`flex: 1`) at 75%. Middle `flex: 1`, gap 10: one highlighted `ReadinessRow` for the current user (radius 24, padding 16, violet gradient surface, `border.violet`, glow, 44px avatar with an activity ring, two status chips) then plain rows for ready members (`surface.row`, 44px avatar with a soft ring, name 15/700, `Ready` 13/700 in `accent.cyanSoft`), then a **pending** row (dashed border, `rgba(255,255,255,0.02)`, flat 44px avatar disc at 0.45, name at 0.6, `Waiting for Screen Time` 12/600 amber, `Nudge` pill). Bottom: primary + a 12/600 note at 0.32.

**Copy.** `밤샘 금지단` · `3 of 4 ready` · chips `✓ Screen Time` `✓ 6 apps` · `Ready` · `Waiting for Screen Time` · `Nudge` · CTA `Go to waiting room` · note `2명 이상 준비되면 시작할 수 있어요.`

**Destination.** → 14.

**States.** Realtime: rows re-sort as members become ready (ready first, pending last), animated per `MOTION_SPEC` §5. `Nudge` sends a notification and disables for 60s (pill drops to 0.4). Fewer than 2 ready: CTA still navigates, but 14's start button is disabled.

**Scroll.** `ScrollView` beyond 5 members.

---

## 14 · Waiting room

**Purpose.** The social space where the group gathers. Calm, not a game lobby.

**Layout.** Top: group `StatusPill` + title 26/800 centered. Center: **280px orbit** — dashed outer, arc inset 24 (mask 88%) with a blurred duplicate breathing at 7s, center `8h` at **56/800/−0.05em** + `shared every day` 13/600. Four 38px seats at radius 140: ready members filled with per-avatar glow, not-ready members as dashed discs showing their initial at 0.45. Bottom gap 12: status line (cyan dot + "3 friends ready · 수민 준비 중"), primary `Start our pool` (padding 17, 17/800, stronger shadow), secondary `Invite another friend`, and a 12/600 note at 0.30 documenting the member-side variant.

**Copy.** `밤샘 금지단` · `다 모였어요` · `8h / shared every day` · `3 friends ready · 수민 준비 중` · `Start our pool` · `Invite another friend` · member view: `Waiting for 정원 to start`.

**Roles.** Admin sees the primary CTA. Members see the same screen with the CTA replaced by a non-interactive glass row reading `Waiting for 정원 to start` (15/700 at 0.7) — same layout, same orbit.

**Destination.** `Start our pool` → 15. Members are pushed to 15 by the realtime event.

**States.** Fewer than 2 ready members: CTA at 0.4 opacity, disabled, note reads "2명 이상 준비되면 시작할 수 있어요". Someone joins or becomes ready while open: seat animates in, status line counts up.

---

## 15 · Group started

**Purpose.** A restrained celebration and the hand-off into the product.

**Layout.** Top: mono eyebrow `POOL ACTIVE` at 0.4. Center: **300px orbit** — arc inset 26 (mask 86%) at the pool's real progress (full 8h at start), blurred duplicate at blur 16, inner bloom, center `8h 00m` at **52/800/−0.05em** + `shared today` 13/600. Four 40px avatars at radius 150, **all glowing**. Bottom block gap 22: headline 32/800/−0.035em + caption 14/500 muted, then the primary CTA.
Screen bloom: the largest in the app — violet→cyan 560px at 0.5, breathing at 5s. This is the only screen where the bloom exceeds the frame width.

**Copy.** `POOL ACTIVE` · `8h 00m / shared today` · `Our time starts now.` · `4명이 하나의 시간을 공유해요.` · `See today`.

**Destination.** `See today` → Today (Fresh Day state), via the morph in `ONBOARDING_MOTION_SPEC` §6.

**States.** No confetti, no sound. Auto-advance is **not** used here — the user taps.

---

## 16 · Permission recovery

**Purpose.** The in-product path back for anyone who declined. Uses the Today layout, not an onboarding layout.

**Layout.** This screen follows the **core** frame: padding `64 / 20 / 108`, bottom navigation present with Today active.
- Header: greeting 24/800 + "아직 우리 시간에 참여하지 못했어요." + a flat 44px avatar at `rgba(255,255,255,0.10)`.
- Hero card: radius 32, padding 20, `surface.cardNeutral` #0D0D12, `border.hairline`, **no bloom**. Pill row with a grey dot + `NOT COUNTED` mono. A 158px grey track ring, the user's own seat dashed at 12 o'clock while the other members' avatars sit filled at 3 and 6 o'clock (radius 79), center `— —` 30/800 at 0.35 + "권한이 꺼져 있어요". Then `PermissionCTA`: body 14/700 at 0.72 + primary button (padding 14, 15/800).
- Below: eyebrow `EXPLORE WITHOUT PERMISSION` + three rows (radius 22, padding `14px 16px`): "친구들의 오늘 / 볼 수 있어요", "Goals · Activity / 볼 수 있어요", and a dashed row "내 시간 합산 / 권한 필요" in amber.

**Copy.** `Connect Screen Time to join today's shared pool.` · `Connect Screen Time` · row labels as above.

**Destination.** Grant → 06a success → returns to Today in its live state. Decline → stays; the same CTA also appears in MY.

**States.** This is itself the "denied" state of Today (`TODAY_STATE_SPEC` §H) — implement it once and reuse it, do not fork a second screen.
