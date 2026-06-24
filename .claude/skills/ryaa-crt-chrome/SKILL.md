---
name: ryaa-crt-chrome
description: Reproduce and extend the RYAA visual identity — a warm-paper minimalist page anchored by ONE retro moment (a silver molded Colani-style CRT television whose gray screen shows a glowing wordmark with an animated RGB-refraction sweep), plus flat brushed-chrome accents and Designers-Republic vector punctuation. Use whenever building or extending RYAA-branded frontend (landing pages, marketing sites, app shells). Triggers: "RYAA design", "the CRT look", "our aesthetic", "the TV hero", or requests to add pages/sections in this style.
---

# RYAA — CRT / Chrome / Warm-Paper Aesthetic

This skill reproduces an already-shipped identity. Goal: faithful reproduction and extension, not reinvention. The exact CSS lives in `references/` — load it when you reach that surface (see pointers below). Read §1 and §2 every time; they are the rules and tokens you will get wrong without this skill.

## 1. Hard rules (each one encodes a correction made during the original build — violating them reproduces a rejected design)

- **No "vibe-code" / terminal aesthetic.** Forbidden: gutter glyphs (`›` `~` `?`), `[ yes ]` bracket buttons, dot-matrix LED readouts, monospace "code-comment" labels (`// what it does`), fake filenames (`confirm.gate`), faux code panels. The ONLY allowed terminal nod is the single blinking cursor on the CRT screen.
- **No small-label-over-big-thing.** No tiny eyebrow/kicker above a heading. No numbered sector markers (`01 / 02 / 03`) as decoration. Section identity comes from the title itself, set big and bold. (Structural devices must encode something true, not decorate — per Anthropic's frontend-design skill.)
- **No stray decorative dots.** The ONLY dot on the page is the period in the `ryaa.` wordmark. No status dots, bullet dots, or LED dots.
- **No HUD frame** on the hero (corner brackets + mono readouts) — tried and rejected.
- **Chrome is flat brushed silver, never gold.** The bezel badge is FLAT chrome, never 3D-extruded (extrusion was tried and reverted).
- **Restraint beats maximalism.** Never more than ~two loud moves per viewport; ornament sits behind content. References are Designers-Republic / vectorheart / Chromecore, NOT pastel-butterfly Y2K. When in doubt, remove.

## 2. Design tokens — copy verbatim, never substitute new colors/fonts

```css
:root {
  --paper: #efede6;
  --paper-2: #e6e3db;
  --ink: #14130f;
  --ink-soft: #6b695f;
  --line: rgba(20, 19, 15, 0.14);
  --teal: #0b7a6b;
  --r: 18px;
  --maxw: 720px;
  --pad: 40px; /* --pad → 22px on mobile */
}
```

Fonts (Google) — load all four, roles are fixed:
`Familjen Grotesk` display (logo, hero H1, section titles, CRT screen text) · `Hanken Grotesk` body only · `Space Mono` ONLY genuine tech bits (nav links, buttons, `code` chips — never section labels) · `Saira Condensed 800 italic` ONLY the chrome bezel badge.
Rejected fonts, do not reach for: Michroma, Orbitron, Quicksand, Space Grotesk.

Teal is an ACCENT (power-button + button hover glow only), not a theme. Do not flood the page with it.

## 3. Page skeleton

Single centered column (`--maxw`, `.wrap{margin:0 auto;padding:0 var(--pad)}`). Order: glass-pill nav (fixed) → CRT TV hero → H1 + sub + two buttons → three text sections (separated by Designers-Republic tick/swatch dividers, NOT plain hairlines) → footer. Sections `padding:92px 0`.

## 4. When to load each reference

Load on demand — do not pull all of these up front:

- Building/touching the **TV** (cabinet, pods, screen, on-screen text, bezel badge, power/control buttons) → read `references/crt-tv.md`.
- Building/debugging the **RGB-refraction sweep** (the signature animation) → read `references/rgb-sweep.md`. **Read this before attempting the sweep** — it contains two non-obvious bugs that will otherwise recur.
- **Chrome buttons, sparkles, section titles, tick/swatch dividers** → read `references/chrome-and-vector.md`.
- **Glass surfaces** (nav, phone, confirm card) + Liquid Glass / React-Native notes → read `references/glass.md`.
- Writing **copy** or new section content → read `references/copy-voice.md`.

**Canonical build:** `assets/ryaa-reference.html` is the complete, shipped single-file page this skill was extracted from. When a reference file and your memory disagree, or you need to see how pieces fit together in context, read the relevant section of that file as ground truth. Do not copy it wholesale into a new page — use it to verify exact values and structure.

## 5. Top-level gotchas (keep in mind even before opening a reference)

- The CRT screen background is **gray** (`radial-gradient ellipse #6f6e66→#4a4943`), never black. Black reads as "off"; gray reads as a powered idle tube.
- CRT effects (scanlines, glow, sweep) belong ONLY to the hero TV. The section-1 phone is a CLEAN device — no CRT effects on it.
- The bezel badge `RYAA` is **absolutely centered** independent of the power button (left) and control buttons (right), so it stays dead-center regardless of side widths.
- Chrome must read as a SYSTEM: the same brushed-silver button gradient is reused on the nav pill AND the primary hero CTA. Only ONE chrome button per cluster — the secondary stays a quiet outline.
- Sparkles are solid **black** (`var(--ink)`), never teal, and placed deliberately/sparsely (hero cluster + one per section title), never scattered.
- Always ship a `@media (prefers-reduced-motion: reduce)` block that freezes all animations, hides the `.crt-word.ghost` layers, and holds the cursor solid.

## 6. Extension checklist (adding a new page or section)

- [ ] Use §2 tokens and font roles unchanged.
- [ ] One centered `--maxw` column; `92px` section rhythm with tick/swatch dividers (`references/chrome-and-vector.md`).
- [ ] Big bold steel-chrome title + ONE black sparkle beside it. No eyebrow, no numbered marker, no mono label.
- [ ] Reuse the chrome button for any primary CTA; quiet outline for secondary.
- [ ] New panels get glass (`references/glass.md`), not new colors.
- [ ] Keep the CRT TV as the SOLE heavy retro element — don't add a second loud surface.
- [ ] Re-read §1 before shipping. If anything smells like vibe-code or small-label-over-big-thing, remove it.
