# Liquid glass — composer capsule + frosted input inset

Real iOS 26 Liquid Glass (`expo-glass-effect`, `UIGlassEffect`) for the RYAA
composer, with `expo-blur` as the universal fallback. Target device is on iOS
26.5, so the genuine refraction path is what we see day to day; the blur path
covers Android, pre-26 iOS, and the deliberately-frosted input well.

## The material stack

Two materials, layered, so the input reads as recessed *into* the capsule:

- **Outer capsule → liquid glass.** `GlassView` refracts the backdrop (the
  scrolling chat behind it). This is the "clear/lensing" material.
- **Input well → frosted blur.** A `BlurView`, forced even on iOS 26, so it
  contrasts against the clear glass around it and reads as an inset well.
- **Send button → brushed chrome.** Unchanged `ChromeButton`. It's a normal
  opaque child sitting on top of the glass — the tactile counterpoint to the
  glass. Never turn it into glass.

## How it's wired

`components/Glass.tsx` is one component with two backends, chosen at module load
via `isLiquidGlassAvailable()` (cached in `LIQUID`):

- `<Glass>` → liquid glass when `LIQUID`, else blur.
- `<Glass frosted>` → **always** blur, even when `LIQUID`. This is the escape
  hatch for the input well. `frosted` also flips the lighting (see below).

The composer (`Chat.tsx`) nests them:

```
<Glass nav>                 // capsule — liquid glass
  <Glass frosted>           // input well — forced frost
    <TextInput />
  </Glass>
  <ChromeButton />          // chrome — untouched
</Glass>
```

`Chat.tsx`'s composer markup is the only caller that changed; the nav header and
confirm `GlassCard` inherit liquid glass for free.

## Rules that will bite you

- **Refraction needs to see through.** On the liquid path, do NOT paint the old
  opaque `glassPanel`/`glassNav` underlay or the `topHighlight` hairline — they
  kill the lensing and double the specular edge. Carry the warm-paper tint via
  `GlassView`'s `tintColor` (low alpha) instead.
- **Never `opacity: 0`** on a `GlassView` or any ancestor — it nukes the effect
  entirely (not a fade). Animate via `glassEffectStyle`, not opacity. The
  composer animates nothing on opacity, so we're clear.
- **`GlassView` falls back to a plain `View`** (no blur) on unsupported
  platforms — that's why the `frosted`/blur branch exists for everyone else.

## Inset lighting (frosted well)

A recessed well is lit *opposite* to a raised surface:

- **Top inner edge → dark hairline** (`rgba(0,0,0,0.08)`): implies the lip casts
  a shadow inward. This is the whole "pressed-in" illusion (RN has no real
  inner-shadow).
- **Bottom inner edge → faint white** (`rgba(255,255,255,0.5)`): completes the
  recess.
- Capsule keeps the opposite (bright `topHighlight`) on its blur fallback.

## Tuning numbers (look-at-it, not calculated)

Verify on device and dial these — a `BlurView` nested in a `GlassView` is a blur
material sampling a glass material's output, which can read heavier than
expected:

- **Frosted well intensity ≈ 18–22.** It sits on already-processed glass; higher
  muddies into gray. Start at 20.
- **Capsule `tintColor` alpha ≈ 0.12–0.30.** Too opaque and you lose the
  lensing. Paper-tinted for the `nav` capsule.
- **Inset intensity is the dial:** push it down until the frost reads as a clean
  recessed pane, not a smudge.

## The CRT layers — split into texture (behind glass) + sweep (on top)

The effect is in two components, because of a real conflict: **clear glass
occludes a thin sweep line at the header/composer.** So the moving line lives on
top, the static texture lives behind.

- **`components/CrtBackdrop.tsx`** — mounted as the FIRST child of `Chat.tsx`,
  behind the list + glass, over the paper fill. Static only:
  - **Idle-tube glow** — faint gray vertical wash (never black, per skill §5).
  - **Scanlines** — 1px line every 3px via an SVG `Pattern`, very low alpha.
  
  This is what the clear glass refracts.
- **`components/CrtSweep.tsx`** — mounted as the LAST child of `Chat.tsx`, a
  full-screen `pointerEvents="none"` OVERLAY on top of everything. The RGB line:
  a 10px feathered band (red top / white core / cyan bottom) translating
  `-BAND → windowHeight + BAND` every 9s via `Animated` (native-driver
  transform). On top so it spans header→composer with no gap. RN has no
  `mix-blend: screen`, so the glow is low-alpha additive colors over warm paper.

Reduce-motion (`AccessibilityInfo`) returns `null` from `CrtSweep` — no frozen
colored bar — leaving the static glow + scanlines.

**Trade-off of the split:** the glass no longer *bends* the moving line (it's on
top now), only the static scanlines/glow behind it. If you want the line bent by
the glass instead, move `CrtSweep` back behind the glass and accept it reads
faint at the header. To keep the line on top but spare the `ryaa.` wordmark, mask
the header rect out of the overlay.

### Tuning knobs

- `CrtBackdrop` glow alphas (`0.10 / 0.03 / 0.10`) — drop toward 0 if paper looks dingy.
- `CrtBackdrop` scanline alpha (`0.05`) and spacing (`3px`).
- `CrtSweep` `BAND` (10) and `PERIOD` (9000ms); core/edge alphas (`0.16 / 0.09`).
  Keep the feather symmetric around the `0.5` core.

## Version note

`package.json` pins `expo ~54.0.35`; `mobile/AGENTS.md` references the v56 docs.
Resolve that mismatch. The glass-effect API used here (`GlassView`,
`isLiquidGlassAvailable`, `glassEffectStyle`, `tintColor`) is stable across
54→56, but confirm against whichever SDK you actually ship.
