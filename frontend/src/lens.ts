// Liquid-glass lens map generator — the "full send" of Aave's "Building glass
// for the web" (https://aave.com/design/building-glass-for-the-web).
//
// The effect rests on SVG's feDisplacementMap: it reads a map image and, per
// pixel, uses the map's red/green channels to push the backdrop horizontally /
// vertically. The trick to *liquid* glass (vs flat glass) is CURVATURE — the map
// must be neutral in the middle (no bend → sharp center) and curve hard at the
// rim (→ straight lines behind the glass bow). A flat linear gradient only shears.
//
// We model the glass as a 3D surface over a rounded rectangle: a flat plateau in
// the interior that curves down to the edge across a bevel band. The refraction
// is the surface SLOPE, i.e. the gradient of that height field — zero on the
// plateau, steepest at the rim. We render it to a canvas and hand the PNG to the
// SVG filter (see Glass.tsx).

export type LensParams = {
  /** how sharply the surface bows at the rim (Aave's "Curvature"). higher = tighter bend. */
  curvature: number;
  /** bevel width as a multiple of the corner radius (Aave's "Splay"). */
  splay: number;
  /** overall displacement strength as a fraction of element size (Aave's "Scale"). */
  scale: number;
  /** chromatic aberration: how far the R/B channels split from G at the rim (Aave's "Chroma"). */
  chroma: number;
};

// Seeded from Aave's live control panel (Scale 0.100 · Curvature 47 · Splay 0.86 · Chroma 0.41).
export const DEFAULTS: LensParams = {
  curvature: 60, // exp ≈ 2.6 — bend concentrated toward the rim (higher = tighter)
  splay: 0.6, // bevel width as a fraction of the corner radius
  scale: 0.3, // rim shift ≈ 12% of the element's SHORT side
  chroma: 0.3, // color split at the edge
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Signed distance from (px,py) to a rounded rect centered at the origin. <0 inside, 0 on the edge. */
export function roundedRectSDF(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  r: number,
): number {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

/**
 * Build the displacement map for a w×h rounded rect and return it as a PNG data URL.
 * The map is EXACTLY element-sized so the SVG filter maps it 1:1 (no rescaling, no
 * inward drift of the edge band). Red = horizontal bend, Green = vertical bend,
 * 0.5 (mid-gray) = no bend → the flat center reads as clear, undistorted glass.
 * Only `curvature`/`splay` (shape) live in the map; `scale`/`chroma` (strength) are
 * applied later by the SVG filter.
 */
export function generateLensMap(
  w: number,
  h: number,
  radius: number,
  opts?: Partial<LensParams>,
): string {
  const { curvature, splay } = { ...DEFAULTS, ...opts };
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const halfW = cw / 2;
  const halfH = ch / 2;
  const r = Math.min(radius, halfW, halfH);
  // cap the bevel so a flat core ALWAYS survives, even on short elements where the
  // corner radius is ~half the height (otherwise the bevel eats the whole tile and
  // the center distorts — Aave keeps the middle dead flat).
  const bevel = Math.max(1, Math.min(r * splay, 0.42 * Math.min(halfW, halfH)));
  const exp = 1 + curvature / 25; // curvature → profile exponent

  // 1) height field: flat plateau (=1) deep inside, convex curve down to 0 at the rim.
  //    (The rounded-rect map is four-fold symmetric — Aave computes one quadrant and
  //    mirrors it; we compute the full grid here for clarity.)
  const H = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const px = x - halfW + 0.5;
      const py = y - halfH + 0.5;
      const d = roundedRectSDF(px, py, halfW, halfH, r);
      const t = clamp01(-d / bevel); // 0 at edge → 1 deep inside
      H[y * cw + x] = 1 - Math.pow(1 - t, exp);
    }
  }

  // 2) displacement = -∇H (finite differences), normalized ANALYTICALLY.
  //    We deliberately do NOT normalize by the data peak: the rim/corners spike,
  //    that spike becomes the divisor, and the rest of the bevel gets crushed to
  //    near-neutral — a thin ring with a "hollow" core. Instead we scale by the
  //    known profile slope (≈exp at the rim) so the WHOLE shoulder stays vivid and
  //    clamps, matching Aave's map (smooth wide colored band, flat gray center).
  //    A central diff spans 2px and dt/dx = 1/bevel, so g ≈ −2·slope/bevel;
  //    g·bevel/(2·exp) maps the rim slope to ≈1. BOOST fills the shoulder.
  const BOOST = 1.6;
  const k = (bevel * BOOST) / (2 * exp);
  const clampSym = (n: number) => (n < -1 ? -1 : n > 1 ? 1 : n);

  const img = ctx.createImageData(cw, ch);
  const data = img.data;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const xl = x > 0 ? x - 1 : x;
      const xr = x < cw - 1 ? x + 1 : x;
      const yt = y > 0 ? y - 1 : y;
      const yb = y < ch - 1 ? y + 1 : y;
      const gx = H[y * cw + xl] - H[y * cw + xr];
      const gy = H[yt * cw + x] - H[yb * cw + x];
      const i = (y * cw + x) * 4;
      data[i] = clamp01(0.5 + 0.5 * clampSym(gx * k)) * 255; // R = horizontal bend
      data[i + 1] = clamp01(0.5 + 0.5 * clampSym(gy * k)) * 255; // G = vertical bend
      data[i + 2] = 128; // B unused
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Whether to use the real lens at all. SVG filters in backdrop-filter are
 * Chromium-only; and we honor the user's reduced-transparency preference. When
 * false, glass elements keep their CSS frosted fallback.
 */
export const REFRACTS: boolean =
  typeof window !== "undefined" &&
  typeof CSS !== "undefined" &&
  (CSS.supports("backdrop-filter", "url(#a)") ||
    CSS.supports("-webkit-backdrop-filter", "url(#a)")) &&
  !window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
