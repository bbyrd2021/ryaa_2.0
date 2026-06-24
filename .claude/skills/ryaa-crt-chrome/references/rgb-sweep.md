# Reference — RGB-refraction sweep (the signature animation)

A thin horizontal band sweeps top→bottom over the WHOLE screen every 4.5s. As it passes, the content splits red-left / cyan-right (classic VHS/CRT chromatic aberration) with a bright white core. This is the page's memorable motion. **Read the two gotchas first — they cost real debugging time the first time around and will recur if you build the sweep from intuition.**

## Two gotchas that WILL bite you

1. **Animate the bar with `background-position`, not `mask-position`.** The bright bar (`.crt-sweep`) is drawn with a `background` gradient. Animating `mask-position` on it does nothing (it has no mask) — the bar sits frozen while only the ghosts move, so the effect looks stuck to the wordmark. The bar must animate `background-position`.
2. **All three layers must share the same box and band size or they desync into two separate waves.** The red ghost, cyan ghost, and bright bar must all be siblings inside `.crt-screen`, all `position:absolute; inset:0`, so percentage positions resolve against the identical box. Band thickness must be `5%` for BOTH the ghost `mask-size` and the bar `background-size`, with matched feathering, or the colored fringe reads thicker than the white core.

## How it works

Three full-screen layers inside `.crt-screen`:

- Two **ghosts** = duplicate copies of the on-screen text, tinted via `color` (red `#ff1a1a`, cyan `#1affff`) and nudged ±3px horizontally; masked to a thin feathered band that slides via `mask-position`.
- One **bar** (`.crt-sweep`) = a gradient with red leading edge / white core / cyan trailing edge, sliding via `background-position`.
  All on the same 4.5s linear loop, traveling `-20%` → `120%`.

## CSS

```css
.crt-word.ghost {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  mix-blend-mode: screen;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  -webkit-mask: linear-gradient(
      180deg,
      transparent 0%,
      rgba(0, 0, 0, 0.6) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.6) 60%,
      transparent 100%
    )
    no-repeat;
  mask: linear-gradient(
      180deg,
      transparent 0%,
      rgba(0, 0, 0, 0.6) 40%,
      #000 50%,
      rgba(0, 0, 0, 0.6) 60%,
      transparent 100%
    )
    no-repeat;
  -webkit-mask-size: 100% 5%;
  mask-size: 100% 5%;
  -webkit-mask-position: 0 -20%;
  mask-position: 0 -20%;
  animation: crt-band 4.5s linear infinite;
}
.crt-word.ghost-r {
  color: #ff1a1a;
  transform: translateX(-3px);
}
.crt-word.ghost-c {
  color: #1affff;
  transform: translateX(3px);
}
@keyframes crt-band {
  0% {
    mask-position: 0 -20%;
    -webkit-mask-position: 0 -20%;
  }
  100% {
    mask-position: 0 120%;
    -webkit-mask-position: 0 120%;
  }
}

.crt-sweep {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  mix-blend-mode: screen;
  background: linear-gradient(
    180deg,
    transparent 44%,
    rgba(255, 40, 40, 0.18) 48%,
    /* red leading edge */ rgba(255, 255, 255, 0.3) 50%,
    /* bright core */ rgba(40, 255, 255, 0.18) 52%,
    /* cyan trailing edge */ transparent 56%
  );
  background-repeat: no-repeat;
  background-size: 100% 5%;
  background-position: 0 -20%;
  animation: crt-sweep-move 4.5s linear infinite;
}
@keyframes crt-sweep-move {
  0% {
    background-position: 0 -20%;
  }
  100% {
    background-position: 0 120%;
  }
}
```

## Tuning notes

- Thinner band: lower the `5%` on BOTH `mask-size` and `background-size` together (keep them equal).
- Stronger fringe: raise the red/cyan alphas in `.crt-sweep` and widen the ghost color tint, but keep the feather stops symmetric around 50%.
- The cursor splits too because it uses `currentColor` in the ghosts (see `crt-tv.md`).
- Under `prefers-reduced-motion`, hide `.crt-word.ghost` entirely and stop `.crt-sweep` — don't leave a frozen colored band on screen.
