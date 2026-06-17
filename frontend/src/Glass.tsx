import {
  createElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { DEFAULTS, generateLensMap, REFRACTS, type LensParams } from "./lens"

// A glass element that refracts the backdrop through a real per-element lens
// (see lens.ts). It measures its own rounded-rect size, generates a matching
// displacement map, and applies it via an inline SVG filter — with true
// chromatic aberration (R/G/B sampled at slightly different strengths). On
// non-Chromium browsers (or reduced-transparency) it falls back to the CSS frost.

type Size = { w: number; h: number }

type GlassProps = {
  /** the tag to render (div by default; "input" / "header" / "footer" supported). */
  as?: string
  /** corner radius in px — should match the element's CSS border-radius. */
  radius?: number
  /** lens shape/strength overrides (curvature, splay, scale, chroma). */
  lens?: Partial<LensParams>
  /** optional frost: px of blur layered onto the lens (0 = clear glass). */
  frost?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

function useLens(radius: number, lens?: Partial<LensParams>) {
  const ref = useRef<HTMLElement | null>(null)
  const id = "lens-" + useId().replace(/[^a-zA-Z0-9]/g, "")
  const [size, setSize] = useState<Size>({ w: 0, h: 0 })

  useEffect(() => {
    if (!REFRACTS) return
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The map only depends on the SHAPE (size, radius, curvature, splay) — strength
  // (scale/chroma) is applied in the filter, so it doesn't trigger a regen.
  const curvature = lens?.curvature ?? DEFAULTS.curvature
  const splay = lens?.splay ?? DEFAULTS.splay
  const map = useMemo(
    () =>
      REFRACTS && size.w > 0 && size.h > 0
        ? generateLensMap(size.w, size.h, radius, { curvature, splay })
        : "",
    [size.w, size.h, radius, curvature, splay],
  )

  return { ref, id, map, size }
}

export function Glass({
  as = "div",
  radius = 16,
  lens,
  frost = 0,
  className = "",
  style,
  children,
  ...rest
}: GlassProps) {
  const { ref, id, map, size } = useLens(radius, lens)
  const p = { ...DEFAULTS, ...lens }
  const lit = REFRACTS && !!map

  // feDisplacementMap scale = pixel shift at full channel deviation. Channel maxes
  // at ±0.5, so a rim shift of (SHORT side × scale) needs scale×2 here. Keying to
  // the short side keeps wide bars from over-distorting.
  const base = 2 * Math.min(size.w, size.h) * p.scale
  const sR = base * (1 + p.chroma) // red pushed furthest …
  const sG = base
  const sB = base * (1 - p.chroma) // … blue least → color split at the rim

  // frost (blur) goes first so the lens bends an already-frosted backdrop and the
  // bend stays crisp on top of the haze.
  const filter = `${frost ? `blur(${frost}px) ` : ""}url(#${id}) saturate(150%)`
  const mergedStyle: CSSProperties = lit
    ? { ...style, backdropFilter: filter, WebkitBackdropFilter: filter }
    : style ?? {}

  const element = createElement(
    as,
    {
      ref,
      className: lit ? `${className} is-lensed`.trim() : className,
      style: mergedStyle,
      ...rest,
    },
    as === "input" ? undefined : children,
  )

  return (
    <>
      {lit && (
        <svg className="glass-defs" aria-hidden="true" focusable="false" width="0" height="0">
          {/* Pin the map to the element 1:1: region = exactly the bbox (0 0 1 1),
              primitiveUnits in px, and feImage sized in literal pixels — NO
              percentages, which would resolve against the default 120% filter region
              and shove the bevel shoulder inward (the inset "ring in the middle"). */}
          <filter
            id={id}
            filterUnits="objectBoundingBox"
            x="0"
            y="0"
            width="1"
            height="1"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={map}
              result="map"
              preserveAspectRatio="none"
              x="0"
              y="0"
              width={size.w}
              height={size.h}
            />
            {/* three displacement passes → isolate one channel each → recombine.
                R/G/B sample the backdrop at slightly different scales = aberration. */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={sR}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dR"
            />
            <feColorMatrix
              in="dR"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="cR"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={sG}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dG"
            />
            <feColorMatrix
              in="dG"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="cG"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={sB}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dB"
            />
            <feColorMatrix
              in="dB"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="cB"
            />
            <feBlend in="cR" in2="cG" mode="screen" result="rg" />
            <feBlend in="rg" in2="cB" mode="screen" />
          </filter>
        </svg>
      )}
      {element}
    </>
  )
}
