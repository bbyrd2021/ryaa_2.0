# Reference — Glass surfaces (nav, phone, confirm card) + Liquid Glass

Glass is the QUIET layer, for non-metal UI panels only: the nav pill, the section-1 phone, the confirm card. Chrome is the bright accent; glass and chrome must not fight. CRT effects never go on glass surfaces.

## Baseline glass (works in every browser)

```css
/* generic panel */
background: rgba(255, 255, 255, 0.26);
backdrop-filter: blur(16px) saturate(1.3);
-webkit-backdrop-filter: blur(16px) saturate(1.3);
border: 1px solid rgba(20, 19, 15, 0.12);
box-shadow:
  0 18px 50px rgba(20, 19, 15, 0.1),
  inset 0 1px 0 rgba(255, 255, 255, 0.55); /* top highlight */
```

```css
/* nav pill — fixed, fully rounded, slightly paper-tinted */
nav {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 10px 14px 10px 22px;
  background: rgba(239, 237, 230, 0.55);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid rgba(20, 19, 15, 0.12);
  border-radius: 999px;
  box-shadow:
    0 6px 28px rgba(20, 19, 15, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  width: max-content;
  max-width: calc(100vw - 36px);
}
```

## The phone + confirm card (section 1)

A CLEAN device (no CRT effects) showing the product's yield-gate as an editorial confirm card — this proves the "asks before it acts" thesis without any code cosplay.

- `.phone`: 300px wide, `border-radius:40px`, glass fill, speaker-notch via `::before` (`56px×5px`, `rgba(20,19,15,.2)`).
- `.phone-screen`: paper fill, `border-radius:30px`, thin border.
- `.confirm` content in plain prose UI, no monospace/gutters/glyphs:
  "ryaa prepared an event" → bordered event block (title + "Tuesday · 2:00 PM") → "Add this to your calendar?" → solid **Yes, add it** + outline **Edit** → "Nothing saves until you say yes."

## True Liquid Glass (the intended upgrade)

The RYAA repo defines a real refraction layer: an SVG `feDisplacementMap` distorting what's behind the glass, over an average-color base (not just a blur). Use it where the repo provides it. Paste the repo's SVG filter + glass surface CSS rather than reinventing it.

### Gotchas

- SVG `backdrop-filter:url(#filter)` refraction renders in **Chromium** but **Safari and Firefox largely ignore it** and fall back to flat/blurred glass. ALWAYS keep the blurred baseline above as the fallback so non-Chromium users still get a glass surface.
- This is a DOM/CSS technique — it does **not** port to React Native. An RN port (e.g. the Herald app) needs native iOS-26 Liquid Glass APIs or a `@shopify/react-native-skia` shader to fake the displacement, with a flat-blur fallback on Android. Treat the web refraction and the RN implementation as two separate builds.
