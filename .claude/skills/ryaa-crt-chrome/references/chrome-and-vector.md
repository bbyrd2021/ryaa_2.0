# Reference — Chrome system, sparkles, section titles, dividers

## Chrome buttons (reuse as a SYSTEM)

The same brushed-silver gradient appears on BOTH the nav pill and the primary hero CTA — that repetition is what makes chrome read as a system rather than a one-off. Only ONE chrome button per cluster; the secondary stays a quiet outline.

```css
/* primary chrome button — light top, mid-gray band ~52%, highlight bottom, teal-tinted hover shadow */
.btn-solid,
.nav-cta {
  color: #1a1a17;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: linear-gradient(
    180deg,
    #ffffff 0%,
    #e2e1dc 38%,
    #b6b5af 52%,
    #d6d4ce 70%,
    #f1efe9 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 -2px 3px rgba(0, 0, 0, 0.18),
    0 2px 6px rgba(20, 19, 15, 0.18);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}
.btn-solid:hover,
.nav-cta:hover {
  background: linear-gradient(
    180deg,
    #ffffff 0%,
    #ebeae5 38%,
    #c4c3bd 52%,
    #e0ded8 70%,
    #ffffff 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -2px 3px rgba(0, 0, 0, 0.15),
    0 3px 10px rgba(11, 122, 107, 0.3);
}
/* secondary stays quiet */
.btn-line {
  background: transparent;
  color: var(--ink);
  border: 1.5px solid rgba(20, 19, 15, 0.25);
}
.btn-line:hover {
  border-color: var(--ink);
}
```

## Sparkles (the recurring vector motif)

4-point sparkle, solid `var(--ink)` (black, never teal), placed deliberately and sparsely. SVG path:

```
M50 0 C54 38 62 46 100 50 C62 54 54 62 50 100 C46 62 38 54 0 50 C38 46 46 38 50 0 Z
```

- **Hero cluster:** three sparkles in negative space at the TV's edges. Use NEGATIVE offsets so they sit OUTSIDE the cabinet (not hidden behind it). Vary size + opacity so they feel placed.
  ```css
  .spark {
    position: absolute;
    z-index: 5;
    fill: var(--ink);
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(20, 19, 15, 0.15));
  }
  .spark-1 {
    width: 42px;
    height: 42px;
    top: -22px;
    right: -8px;
    opacity: 0.92;
  }
  .spark-2 {
    width: 24px;
    height: 24px;
    top: 14px;
    left: -18px;
    opacity: 0.82;
  }
  .spark-3 {
    width: 15px;
    height: 15px;
    top: -30px;
    right: 40px;
    opacity: 0.7;
  }
  ```
  (`.crt-stage` must be `position:relative` for these to anchor.)
- **Each section title:** one 22px black sparkle to the left of the headline.
  ```css
  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 40px;
  }
  .spark-title {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    margin-top: 0.12em;
    fill: var(--ink);
    opacity: 0.9;
  }
  ```

## Section titles — big, bold, steel-chrome fill

Titles carry the section alone (no eyebrow). Dark-anchored steel gradient so they read metallic yet stay legible on paper.

```css
.section-title {
  font-family: "Familjen Grotesk", sans-serif;
  font-weight: 700;
  font-size: clamp(34px, 5.4vw, 56px);
  letter-spacing: -0.04em;
  line-height: 1.02;
  max-width: 640px;
  background: linear-gradient(
    176deg,
    #45443f 0%,
    #14130f 40%,
    #3a3935 52%,
    #14130f 64%,
    #4a4943 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.title-row .section-title {
  margin-bottom: 0;
}
```

## Designers-Republic tick/swatch dividers (NOT plain hairlines)

Section breaks are graphic: three solid ink squares (left) + hairline rule + tick marks (right).

```css
.section {
  padding: 92px 0;
  border-top: none;
  position: relative;
}
.section::before {
  content: "";
  position: absolute;
  top: 0;
  left: var(--pad);
  right: var(--pad);
  height: 8px;
  opacity: 0.85;
  background:
    linear-gradient(var(--ink) 0 0) left 0 top 0 / 8px 8px no-repeat,
    linear-gradient(var(--ink) 0 0) left 11px top 0 / 8px 8px no-repeat,
    linear-gradient(var(--ink) 0 0) left 22px top 0 / 8px 8px no-repeat,
    linear-gradient(var(--line) 0 0) left 38px top 50% / calc(100% - 38px) 1px
      no-repeat;
}
.section::after {
  content: "";
  position: absolute;
  top: 0;
  right: var(--pad);
  width: 64px;
  height: 8px;
  opacity: 0.5;
  background: repeating-linear-gradient(
    90deg,
    var(--ink) 0 1px,
    transparent 1px 9px
  );
}
```

## Gotchas

- Sparkles black, never teal. Section-title sparkles were teal in one draft and rejected.
- Hero sparkles need negative offsets or they hide behind the cabinet.
- Section-title chrome is the BOLDEST move below the hero; if a page feels too heavy, this is the first thing to soften (back to solid `var(--ink)`).
- Do NOT add a hover chrome sheen to feature rows — tried and removed; feature lists stay quiet hairline-separated items.
