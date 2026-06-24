# Reference — The CRT television (the hero centerpiece)

The single retro moment on the page. Build precisely. For the RGB-refraction sweep that runs on the screen, see `rgb-sweep.md` (read it before wiring the sweep).

## DOM structure

```html
<div class="crt-stage">
  <!-- sparkle cluster — see chrome-and-vector.md for the SVG path + placement -->
  <div class="crt">
    <div class="crt-head">
      <span class="crt-pod crt-pod-l"></span>
      <div class="crt-screen">
        <div class="crt-word base">
          <span class="crt-mark"
            >ryaa<span class="dot">.</span
            ><span class="crt-cursor"></span></span
          >Real-Time Yielding<br />Autonomous Agent
        </div>
        <div class="crt-word ghost ghost-r" aria-hidden="true">
          …same content…
        </div>
        <div class="crt-word ghost ghost-c" aria-hidden="true">
          …same content…
        </div>
        <div class="crt-sweep" aria-hidden="true"></div>
      </div>
      <span class="crt-pod crt-pod-r"></span>
    </div>
    <div class="crt-plate">
      <button class="crt-power"><span class="crt-power-icon"></span></button>
      <span class="crt-plate-text">RYAA</span>
      <div class="crt-controls">
        <span class="crt-btn"></span><span class="crt-btn"></span
        ><span class="crt-btn"></span>
      </div>
    </div>
  </div>
</div>
```

## Cabinet — silver molded Colani bio-design (organic, NOT a sharp rectangle)

```css
.crt {
  position: relative;
  width: 100%;
  max-width: 720px;
  padding: 30px 30px 20px;
  border-radius: 60px / 48px; /* organic oval-ish radius is essential to the look */
  background: linear-gradient(
    165deg,
    #f3f2ef 0%,
    #d2d1cb 20%,
    #a9a8a2 42%,
    #88877f 60%,
    #c0bfb9 80%,
    #ebeae5 100%
  );
  box-shadow:
    0 36px 80px rgba(20, 19, 15, 0.3),
    inset 0 3px 4px rgba(255, 255, 255, 0.85),
    inset 0 -6px 12px rgba(0, 0, 0, 0.28),
    inset 6px 0 14px rgba(255, 255, 255, 0.4),
    inset -6px 0 14px rgba(0, 0, 0, 0.18);
}
.crt::before {
  /* molded highlight sweep on the curved metal */
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 60px / 48px;
  pointer-events: none;
  background:
    radial-gradient(
      ellipse at 50% 0%,
      rgba(255, 255, 255, 0.55) 0%,
      transparent 45%
    ),
    linear-gradient(
      105deg,
      transparent 40%,
      rgba(255, 255, 255, 0.22) 50%,
      transparent 60%
    );
}
.crt-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: stretch;
  gap: 14px;
}
```

## Speaker pods (flank the screen)

```css
.crt-pod {
  flex-shrink: 0;
  width: 30px;
  align-self: stretch;
  border-radius: 22px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    100deg,
    #b9b8b1 0%,
    #87867f 45%,
    #66655f 70%,
    #a3a29b 100%
  );
  box-shadow:
    inset 0 2px 2px rgba(255, 255, 255, 0.5),
    inset 0 -3px 5px rgba(0, 0, 0, 0.4),
    0 1px 2px rgba(255, 255, 255, 0.4);
}
.crt-pod::after {
  /* grille slits */
  content: "";
  position: absolute;
  inset: 18% 7px;
  border-radius: 8px;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.32) 0 2px,
    rgba(255, 255, 255, 0.14) 2px 4px
  );
  box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.5);
}
```

## Screen — GRAY glass recessed into the silver shell

```css
.crt-screen {
  position: relative;
  flex: 1;
  overflow: hidden;
  padding: 64px 28px;
  border-radius: 34px / 40px;
  background: radial-gradient(
    ellipse at 50% 42%,
    #6f6e66 0%,
    #4a4943 80%
  ); /* GRAY, never black */
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 0 50px rgba(0, 0, 0, 0.5),
    inset 0 0 0 3px rgba(0, 0, 0, 0.55),
    inset 0 0 0 7px rgba(255, 255, 255, 0.35),
    /* light inner ring = recessed into silver */ 0 0 0 1px rgba(0, 0, 0, 0.2);
}
.crt-screen::before {
  /* animated scanlines */
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0) 0 1px,
    rgba(0, 0, 0, 0.16) 2px 3px
  );
  animation: crt-flicker 4s steps(60) infinite;
}
.crt-screen::after {
  /* curved-glass vignette + top glare */
  content: "";
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  border-radius: 34px / 40px;
  background:
    radial-gradient(
      ellipse at 50% 12%,
      rgba(255, 255, 255, 0.14) 0%,
      transparent 48%
    ),
    radial-gradient(
      ellipse at 50% 50%,
      transparent 58%,
      rgba(0, 0, 0, 0.32) 100%
    );
}
@keyframes crt-flicker {
  0%,
  100% {
    opacity: 1;
  }
  47% {
    opacity: 0.92;
  }
  48% {
    opacity: 0.78;
  }
  49% {
    opacity: 0.95;
  }
  92% {
    opacity: 0.88;
  }
}
```

## On-screen text — big glowing wordmark, small caption, blinking cursor

The hierarchy is deliberate: `ryaa.` is huge and focal; the agent-name caption is a small two-line subtitle dwarfed beneath it.

```css
.crt-word {
  /* the caption */
  font-family: "Familjen Grotesk", sans-serif;
  font-weight: 700;
  text-align: center;
  color: #fff;
  font-size: clamp(15px, 3vw, 26px);
  letter-spacing: 0.08em;
  line-height: 1.15;
  text-transform: uppercase;
}
.crt-mark {
  /* the big lowercase ryaa. — the focal element */
  display: block;
  text-transform: none;
  font-weight: 700;
  font-size: clamp(56px, 13vw, 120px);
  letter-spacing: -0.05em;
  line-height: 0.9;
  margin-bottom: 0.16em;
}
.crt-word.base {
  position: relative;
  z-index: 3;
  animation: crt-glow 3.2s ease-in-out infinite;
  text-shadow:
    0 0 10px rgba(255, 255, 255, 0.55),
    0 0 28px rgba(255, 255, 255, 0.3),
    0 0 60px rgba(255, 255, 255, 0.18);
}
@keyframes crt-glow {
  0%,
  100% {
    text-shadow:
      0 0 10px rgba(255, 255, 255, 0.55),
      0 0 28px rgba(255, 255, 255, 0.3),
      0 0 60px rgba(255, 255, 255, 0.18);
  }
  50% {
    text-shadow:
      0 0 8px rgba(255, 255, 255, 0.45),
      0 0 20px rgba(255, 255, 255, 0.22),
      0 0 44px rgba(255, 255, 255, 0.12);
  }
}
/* Blinking cursor after ryaa. — the ONE permitted terminal nod. Short, slightly thin block. */
.crt-cursor {
  display: inline-block;
  width: 0.2em;
  height: 0.5em;
  margin-left: 0.06em;
  vertical-align: 0.04em;
  background: currentColor;
  animation: crt-cursor-blink 1.06s steps(1) infinite;
}
.crt-word.base .crt-cursor {
  background: #fff;
  box-shadow:
    0 0 8px rgba(255, 255, 255, 0.7),
    0 0 18px rgba(255, 255, 255, 0.4);
}
@keyframes crt-cursor-blink {
  0%,
  50% {
    opacity: 1;
  }
  50.01%,
  100% {
    opacity: 0;
  }
}
```

The cursor uses `currentColor` so the RGB ghost copies tint it red/cyan and the sweep splits it. The `.base` copy overrides to white-with-glow.

## Bezel plate — power (L) · chrome RYAA badge (center, absolutely centered) · controls (R)

```css
.crt-plate {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 14px 6px;
}
/* badge: Saira Condensed 800 italic, FLAT chrome (no 3D extrusion), dark-engraved so it reads on silver */
.crt-plate-text {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-family: "Saira Condensed", sans-serif;
  font-weight: 800;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: linear-gradient(
    175deg,
    #6e6d67 0%,
    #2f2e2a 45%,
    #1a1916 62%,
    #5a5953 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.55));
}
.crt-power {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(
    circle at 35% 30%,
    #3a3a36 0%,
    #1a1a17 70%,
    #0c0c0a 100%
  );
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.12),
    inset 0 -2px 3px rgba(0, 0, 0, 0.7),
    0 1px 1px rgba(255, 255, 255, 0.06);
}
.crt-power:hover {
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.12),
    inset 0 -2px 3px rgba(0, 0, 0, 0.7),
    0 0 8px rgba(63, 183, 163, 0.5);
}
.crt-power-icon {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid #c4c3bd;
  position: relative;
}
.crt-power-icon::after {
  content: "";
  position: absolute;
  top: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 1.5px;
  height: 6px;
  background: #c4c3bd;
  border-radius: 1px;
  box-shadow: 0 0 0 1.5px rgba(26, 26, 23, 1);
}
.crt-controls {
  flex-shrink: 0;
  display: flex;
  gap: 7px;
}
.crt-btn {
  width: 18px;
  height: 13px;
  border-radius: 3px;
  background: linear-gradient(180deg, #34342f 0%, #1c1c19 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 2px rgba(0, 0, 0, 0.6),
    0 1px 0 rgba(0, 0, 0, 0.4);
}
```

## Gotchas

- Screen background is GRAY, not black (a black tube reads as "off").
- The badge centers absolutely (`left:50%; translate(-50%,-50%)`) so unequal side controls don't shift it off-center. The plate is `justify-content:space-between` for the power/control split underneath.
- Badge is dark-engraved chrome, NOT bright silver — bright silver text disappears against the silver bezel.
- Keep the cabinet radius oval (`60px / 48px`) and screen radius (`34px / 40px`); equal-corner radii kill the organic Colani feel.
