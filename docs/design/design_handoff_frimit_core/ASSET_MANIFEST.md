# ASSET_MANIFEST

The Frimit core UI is almost entirely code-generated. Ship as few images as possible.

---

## Code generated — no asset files

| Item | How |
| --- | --- |
| All surface gradients (hero cards, buttons, avatar fills, toggle, nav scrim) | `expo-linear-gradient` |
| Shared Orbit ring, segments, overshoot arc, mini goal rings | `react-native-svg` `<Circle>` + `strokeDashoffset` |
| Progress bars (12 / 6 / 5px) and the glowing tip dot | `<View>` + `LinearGradient` |
| Card and screen blooms | `react-native-svg` `<RadialGradient>` (default) |
| Status dots and their halos | `<View>` + iOS shadow / small PNG on Android |
| Nav icons (rounded square, ring, 3 bars, disc) | Plain `<View>`s — no icon font, no SVG |
| Avatar discs and initials | `LinearGradient` + `<Text>` |
| Empty-state dashed circle and orbit track dashes | `borderStyle: 'dashed'` / SVG `strokeDasharray` |
| Crown, reaction emoji (👑 🔥 👏 👀 🌙) | System emoji in `<Text>` |

---

## Static assets

### 1. `dot-17.png`
- **Purpose.** Screen-level dot texture.
- **Format.** PNG-32 with alpha.
- **Dimensions.** 17 × 17 px at 1×. Single white dot, 1px diameter, top-left origin, alpha 0.075 baked in.
- **Scale variants.** `@2x` (34×34, 2px dot) and `@3x` (51×51, 3px dot) required.
- **Tiling.** `resizeMode="repeat"`. Never stretched.

### 2. `dot-13.png`
- **Purpose.** Hero-card texture (denser, fainter).
- **Format / dimensions.** PNG-32, 13 × 13 px at 1×, 1px white dot, alpha 0.05.
- **Scale variants.** `@2x`, `@3x`.
- **Tiling.** Repeat, clipped to the card's border radius.

### 3. `dot-22.png`
- **Purpose.** Calm texture for Limit Reached and Permission Off.
- **Format / dimensions.** PNG-32, 22 × 22 px at 1×, 1px white dot, alpha 0.045.
- **Scale variants.** `@2x`, `@3x`.
- **Tiling.** Repeat.

### 4. `ring-activity.png` *(optional — only if the SVG sweep approximation is unsatisfactory)*
- **Purpose.** Conic activity ring behind an avatar.
- **Format.** PNG-32, pre-blurred.
- **Dimensions.** 96 × 96 at 1× (covers avatar sizes 28–46 by scaling down), `@2x` `@3x`.
- **Stretch.** Uniform scale only, never nine-patch.

### 5. `ring-achievement.png` *(optional, same condition)*
- **Purpose.** Gold → violet → cyan rank-1 ring.
- **Dimensions.** 96 × 96 at 1×, `@2x` `@3x`.

### 6. `bloom-violet.png`, `bloom-cyan.png`, `bloom-pink.png` *(optional — Android list performance)*
- **Purpose.** Static replacement for card blooms inside scrolling grids.
- **Format.** PNG-32, radial white-to-transparent, tinted at runtime with `tintColor`, or three pre-tinted files.
- **Dimensions.** 256 × 256 at 1×, `@2x` only (they are soft; `@3x` is not worth the bytes).
- **Stretch.** `resizeMode="stretch"` is fine — the gradient is smooth.

---

## Fonts

| Family | Weights | Source |
| --- | --- | --- |
| Manrope | 400, 500, 600, 700, 800 | `@expo-google-fonts/manrope` |
| JetBrains Mono | 400, 500 | `@expo-google-fonts/jetbrains-mono` |

Korean glyphs come from the system face; no Korean font ships with the app.

---

## Not needed

No illustrations, no icon font, no Lottie files, no photographic avatars in the design (production avatars are user-supplied images loaded at runtime), no background images beyond the three dot tiles, no app-icon work in this handoff.
