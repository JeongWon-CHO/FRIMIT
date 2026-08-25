/**
 * Frimit Core — Design Tokens (V1)
 *
 * Source of truth: "Frimit Design System" page, then Frimit (Today/Goals/Activity/MY),
 * Frimit Group Detail, Frimit Today States.
 * Every value here is extracted from the approved designs. Do not add new visual rules.
 *
 * Usage: import { tokens } from './DESIGN_TOKENS';
 */

export const colors = {
  background: {
    /** App background. 80%+ of every screen. */
    base: '#050507',
    /** Slightly lifted background used behind scrolling content. */
    deep: '#0A0A0D',
  },
  surface: {
    /** Elevated surface (2-col group cards, stat cards). */
    elevated: '#111116',
    /** Card surface reference value from the design system. */
    card: '#17171D',
    /** Per-screen card tints actually used (kept because each carries a different bloom). */
    cardViolet: '#101017',
    cardCyan: '#0E1016',
    cardPink: '#130E12',
    cardNeutral: '#0D0D12',
    /** List row / activity item fill. */
    row: 'rgba(255,255,255,0.035)',
    /** Restrained glass fill — pills, floating controls only. */
    glass: 'rgba(255,255,255,0.07)',
  },
  border: {
    /** Default hairline on cards. */
    hairline: 'rgba(255,255,255,0.07)',
    /** Hairline on glass pills and hero cards. */
    hairlineStrong: 'rgba(255,255,255,0.09)',
    /** Row / secondary surfaces. */
    subtle: 'rgba(255,255,255,0.06)',
    /** Dashed border for empty states and orbit tracks. */
    dashed: 'rgba(255,255,255,0.12)',
    /** Accent-tinted borders on highlighted cards. */
    violet: 'rgba(167,139,250,0.22)',
    cyan: 'rgba(34,211,238,0.26)',
    pink: 'rgba(244,114,182,0.20)',
    amber: 'rgba(252,211,77,0.28)',
  },
  /**
   * Text ramp. Every step is `#F7F7FA` at an alpha, so the ramp keeps one hue and
   * shifts only in lightness — the channel contrast responds to.
   *
   * The alphas are a floor, not a taste: measured against the lightest surface a
   * step can land on (`#17171D`, `#16162A`, and an accent bloom over a card), each
   * text step clears WCAG AA 4.5:1. The previous ramp (white at 0.44 / 0.34 / 0.28)
   * measured 4.30 / 2.96 / 2.34:1 — legible only on a bright display.
   * `design-tokens.test.ts` re-measures these on every run.
   */
  text: {
    primary: '#F7F7FA',
    /** Same job as `metadata`; kept as a name older call sites still use. */
    secondary: 'rgba(247,247,250,0.60)',
    body: 'rgba(247,247,250,0.92)',
    muted: 'rgba(247,247,250,0.72)',
    metadata: 'rgba(247,247,250,0.60)',
    faint: 'rgba(247,247,250,0.52)',
    /** Input placeholder. Carries the field's meaning, so it is text, not decoration. */
    placeholder: 'rgba(247,247,250,0.52)',
    /** Inline link. `accent.blueSoft` — the stray `#3C87F7` it replaces dropped to
     *  4.24:1 on a bloom-lifted card. */
    link: '#60A5FA',
    /** Non-text only — dots, inert controls. Below the text floor by design. */
    disabled: 'rgba(247,247,250,0.40)',
    onLight: '#050507',
  },
  accent: {
    violet: '#7C4DFF',
    violetSoft: '#A78BFA',
    violetPale: '#C4B5FD',
    violetTint: '#DDD6FE',
    indigo: '#6366F1',
    blue: '#3B82F6',
    blueSoft: '#60A5FA',
    bluePale: '#93C5FD',
    cyan: '#22D3EE',
    cyanSoft: '#67E8F9',
    cyanPale: '#A5F3FC',
  },
  state: {
    /** Healthy / plenty of shared time left. */
    healthy: '#22D3EE',
    /** 75% used — violet takes over. */
    tightening: '#A78BFA',
    /** 90% used — violet shifts to magenta. */
    approaching: '#F0ABFC',
    /** Pool complete (100%). */
    complete: '#E9D5FF',
    /** Over the shared limit. Restrained pink, never pure red. */
    overLimit: '#FDA4C0',
    /** A member's data is older than 30 min. */
    staleSync: '#FCD34D',
    staleSyncSoft: '#FDE68A',
    /** Rank #1 reward. */
    achievement: '#FDE68A',
  },
  /** Group accent identity. Applied to dot, gauge arc, bloom and progress only —
   *  never to surfaces, text ramp, radius or type. */
  groupAccent: {
    violet: { key: 'violet', from: '#7C4DFF', to: '#3B82F6', dot: '#A78BFA', bloom: 'rgba(124,77,255,0.55)', surface: '#101017' },
    cyan:   { key: 'cyan',   from: '#22D3EE', to: '#1D4ED8', dot: '#22D3EE', bloom: 'rgba(34,211,238,0.45)',  surface: '#0E1016' },
    pink:   { key: 'pink',   from: '#F472B6', to: '#A855F7', dot: '#F472B6', bloom: 'rgba(244,114,182,0.45)', surface: '#130E12' },
  },
} as const;

export type GroupAccentKey = keyof typeof colors.groupAccent;

export const gradients = {
  /** Progress, toggles, decorative fills. Nothing legible sits on top of it. */
  violetToBlue: { colors: ['#7C4DFF', '#3B82F6'], angleDeg: 100 },
  /** Same accent one lightness step down, for the one filled action that carries a
   *  label. `violetToBlue` drops to 3.44:1 under `#F7F7FA` at its blue end; this
   *  holds 4.71:1 or better across the whole span the label covers. */
  primaryAction: { colors: ['#7C4DFF', '#2563EB'], angleDeg: 100 },
  /** Healthy progress. */
  blueToCyan: { colors: ['#3B82F6', '#22D3EE'], angleDeg: 100 },
  /** Shared pool arc / goal bar. 3 stops, conic from -90deg in the web design. */
  sharedPool: { colors: ['#7C4DFF', '#3B82F6', '#22D3EE'], stops: [0, 0.62, 1], angleDeg: 90 },
  /** 75% state — violet dominant. */
  tightening: { colors: ['#7C4DFF', '#8B5CF6', '#A78BFA'], stops: [0, 0.5, 1], angleDeg: 90 },
  /** 90% state — violet to magenta. */
  approaching: { colors: ['#7C4DFF', '#D946EF', '#F0ABFC'], stops: [0, 0.72, 1], angleDeg: 90 },
  /** Over limit overshoot arc. */
  overLimit: { colors: ['#F472B6', '#FDA4C0'], angleDeg: 90 },
  /** Hero card surface (Group Detail). */
  heroSurface: { colors: ['#16162A', '#0B0B12', '#09090F'], stops: [0, 0.58, 1], angleDeg: 165 },
  /** Hero card surface (Today). */
  heroSurfaceToday: { colors: ['#14141C', '#0B0B11', '#0A0A10'], stops: [0, 0.55, 1], angleDeg: 165 },
  /** Rank #1 achievement ring (conic in web; use 4-stop sweep or static asset). */
  achievementRing: { colors: ['#FDE68A', '#A78BFA', '#22D3EE', '#FDE68A'], angleDeg: 190 },
  /** Avatar activity ring. */
  avatarRing: { colors: ['#22D3EE', '#7C4DFF', '#F0ABFC', '#22D3EE'], angleDeg: 200 },
  /** Bottom nav scrim (bottom → top). */
  navScrim: { colors: ['rgba(5,5,7,0.98)', 'rgba(5,5,7,0)'], stops: [0.4, 1], angleDeg: 0 },
  /** Avatar fills, by member index. */
  avatarFills: [
    ['#8B5CF6', '#6D28D9'],
    ['#60A5FA', '#2563EB'],
    ['#22D3EE', '#0E7490'],
    ['#F0ABFC', '#A855F7'],
    ['#F472B6', '#BE185D'],
    ['#38BDF8', '#2563EB'],
    ['#A78BFA', '#7C3AED'],
    ['#0EA5E9', '#1D4ED8'],
  ],
} as const;

export const typography = {
  fontFamily: {
    /** Manrope in the design; SF Pro / system is an accepted fallback. */
    ui: 'Manrope',
    /** Numeric metadata labels only. */
    mono: 'JetBrainsMono',
  },
  /** letterSpacing values are in px at the given fontSize (RN uses px, not em). */
  heroNumber:      { fontSize: 52, fontWeight: '800', letterSpacing: -2.3, lineHeight: 56 },
  heroNumberMd:    { fontSize: 44, fontWeight: '800', letterSpacing: -1.9, lineHeight: 48 },
  heroNumberSm:    { fontSize: 36, fontWeight: '800', letterSpacing: -1.4, lineHeight: 40 },
  screenTitle:     { fontSize: 32, fontWeight: '800', letterSpacing: -0.96, lineHeight: 36 },
  greeting:        { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, lineHeight: 30 },
  cardTitle:       { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, lineHeight: 21 },
  sectionTitle:    { fontSize: 15, fontWeight: '800', letterSpacing: -0.15, lineHeight: 20 },
  cardNumber:      { fontSize: 22, fontWeight: '800', letterSpacing: -0.66, lineHeight: 26 },
  memberNumber:    { fontSize: 19, fontWeight: '800', letterSpacing: -0.57, lineHeight: 23 },
  body:            { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  bodyStrong:      { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  metadata:        { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  button:          { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  buttonLarge:     { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  /** Mono numeric label, e.g. "54% USED". letterSpacing +10%. */
  numericLabel:    { fontSize: 11, fontWeight: '500', letterSpacing: 1.1, fontFamily: 'JetBrainsMono' },
  /** Uppercase section eyebrow, e.g. "TODAY", "MY GROUPS". */
  eyebrow:         { fontSize: 12, fontWeight: '700', letterSpacing: 1.68 },
  badge:           { fontSize: 11, fontWeight: '800', letterSpacing: 0.66 },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  card: 14,
  md: 16,
  screenHorizontal: 20,
  lg: 24,
  /** Vertical gap between stacked sections inside a screen. */
  sectionGap: 14,
  /** Gap between rows in a list. */
  rowGap: 8,
  /** Gap in the 2-column card grid. */
  gridGap: 12,
  /** Content top inset below the status bar. */
  contentTop: 64,
  /** Content bottom inset so nothing hides under the bottom nav. */
  contentBottom: 108,
} as const;

export const radius = {
  heroCard: 32,
  groupCard: 26,
  memberCard: 26,
  listRow: 22,
  activityItem: 20,
  smallCard: 16,
  button: 18,
  navPill: 20,
  pill: 999,
  avatar: 999,
  bar: 999,
  deviceFrame: 54,
} as const;

export const borders = {
  hairline: 1,
  avatarRingWidth: 2,
  /** Shared Orbit stroke as a ratio of the ring's outer radius (mask 82% → 18%, ~14.6px at r=81). */
  orbitStrokeRatio: 0.18,
  /** Progress bar heights actually used. */
  barHeroHeight: 12,
  barGroupHeight: 6,
  barMemberHeight: 5,
} as const;

export const opacity = {
  /** Non-selected bottom-nav item content. Carries a label and an icon, so it sits
   *  at the text floor, not at "barely there" — 0.34 measured 2.83:1. */
  navInactive: 0.52,
  /** Muted avatars (limit reached state). */
  dimmedAvatar: 0.85,
  /** Unselected accent swatch. */
  unselectedSwatch: 0.55,
  bloomHero: 0.55,
  bloomCard: 0.45,
  bloomAmbient: 0.30,
  dotScreen: 0.075,
  dotHeroCard: 0.05,
  dotCalm: 0.045,
} as const;

/**
 * Glow. In RN these are radial bloom layers (SVG RadialGradient or a static PNG),
 * plus a small number of native shadows. Never more than 2 blurred layers per screen.
 */
export const glow = {
  hero:        { color: '#7C4DFF', opacity: 0.55, blur: 28, size: 300, usage: 'One bloom at the top of the hero card.' },
  heroCyan:    { color: '#22D3EE', opacity: 0.26, blur: 28, size: 230, usage: 'Secondary bloom, opposite corner of the hero card.' },
  card:        { color: 'accent', opacity: 0.45, blur: 26, size: 220, usage: 'One bloom per group / member card, positioned per accent.' },
  ambient:     { color: '#7C4DFF', opacity: 0.32, blur: 30, size: 400, usage: 'Off-screen screen-level bloom, max one per screen.' },
  avatarRing:  { blur: 4, opacity: 0.75, usage: 'Conic ring behind an avatar with new activity.' },
  navActive:   { shadowColor: '#7C4DFF', shadowOpacity: 0.35, shadowRadius: 24, usage: 'Selected bottom-nav pill.' },
  statusDot:   { shadowRadius: 10, spread: 2, opacity: 0.85, usage: 'Group / status dots, colored by accent or state.' },
  achievement: { colors: ['#FDE68A', '#A78BFA'], blur: 4, opacity: 0.75, usage: 'Rank #1 only. Max one per screen.' },
  progressTip: { color: '#22D3EE', shadowRadius: 16, spread: 4, usage: 'Bright dot at the end of the goal progress bar.' },
} as const;

export const motion = {
  duration: {
    /** Press-in / press-out. */
    fast: 120,
    /** Standard property change (color, opacity, small translate). */
    normal: 240,
    /** Gauge and number counting. */
    slow: 420,
    /** State crossfade (Normal → 75% → 90% …). */
    stateChange: 600,
    /** Orbit intro / group started. */
    orbit: 900,
  },
  easing: {
    /** Most transitions. Reanimated: Easing.bezier(0.22, 1, 0.36, 1) */
    standard: [0.22, 1, 0.36, 1],
    /** Press feedback. Easing.bezier(0.4, 0, 0.2, 1) */
    press: [0.4, 0, 0.2, 1],
    /** Glow breathing loop. Easing.inOut(Easing.sin) */
    breathe: 'inOutSine',
  },
  press: {
    /** Card press: surface sinks slightly. */
    scale: 0.985,
    overlayOpacity: 0.04,
  },
  loop: {
    /** Ambient bloom breathing, as in the approved designs. */
    heroPulseMs: 6000,
    approachingPulseMs: 4500,
    calmPulseMs: 7000,
  },
} as const;

export const layout = {
  screenWidth: 390,
  screenHeight: 844,
  bottomNavHeight: 104,
  statusBarHeight: 54,
  heroGaugeSize: 162,
  heroGaugeBoxHeight: 178,
  orbitSize: 158,
  orbitAvatarSize: 28,
  groupCardHeight: 124,
  groupCardWideHeight: 88,
  statCardHeight: 104,
  avatar: { xl: 96, lg: 46, md: 40, sm: 38, xs: 34, xxs: 28, micro: 26 },
  avatarStackOverlap: -9,
} as const;

export const dotTexture = {
  screen:  { tile: 17, dotSize: 1, color: 'rgba(255,255,255,0.075)' },
  heroCard:{ tile: 13, dotSize: 1, color: 'rgba(255,255,255,0.05)' },
  calm:    { tile: 22, dotSize: 1, color: 'rgba(255,255,255,0.045)' },
  /** Secondary surfaces (list rows, small cards) carry no dot texture. */
  none: null,
} as const;

export const tokens = {
  colors, gradients, typography, spacing, radius, borders,
  opacity, glow, motion, layout, dotTexture,
} as const;

export default tokens;
