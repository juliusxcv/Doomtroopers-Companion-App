import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { loadPerilArtwork, PERIL_CENTER, PERIL_SLOT_IDS, PERIL_SLOT_ORIGINS, PERIL_VIEW_BOX } from '../lib/perilArtwork'
import { buildFlinchKeyframes, buildPainFlashKeyframes } from '../lib/perilFlinch'
import { MAX_PERIL_LEVEL, MIN_PERIL_LEVEL } from '../lib/perils'

// Taps closer together than this build on each other, escalating the
// reaction — poking it repeatedly makes it thrash harder, not just repeat.
const TAP_STREAK_WINDOW_MS = 900

export type PerilSigilProps = {
  /** Number of dice slots to draw — the current Peril Level (1-8). */
  count: number
  /** Length === count. null = empty/not-yet-settled slot. */
  values: (number | null)[]
  /** Index of the slot currently mid-flicker, if any. */
  activeIndex: number | null
  /** Shown at the sigil's heart once set (all dice have landed). */
  total: number | null
  /** Dormant (thin/dim) vs charged (glowing) rendering. */
  charged: boolean
  /** True only while dice are actively landing. */
  rolling: boolean
}

export function PerilSigil({ count, values, activeIndex, total, charged, rolling }: PerilSigilProps) {
  const [artworkHtml, setArtworkHtml] = useState<string | null>(null)
  const artworkRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPerilArtwork().then((html) => {
      if (!cancelled) setArtworkHtml(html)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Pin each rune slot's own transform-origin to its RuneOrigin center (from
  // the Illustrator export) so any rotate/scale applied to it pivots around
  // that rune's own middle instead of the canvas corner. The Rotation Ring
  // itself does NOT use transform-origin (see peril-ring-spin in
  // index.css) — transform-box: view-box wasn't honored reliably for it,
  // spinning it around the canvas corner instead of its own center.
  useEffect(() => {
    if (!artworkHtml || !artworkRef.current) return
    PERIL_SLOT_IDS.forEach((id, i) => {
      const origin = PERIL_SLOT_ORIGINS[i]
      const el = artworkRef.current?.querySelector<SVGGElement>(`#${id}`)
      if (!el || !origin) return
      el.style.transformBox = 'view-box'
      el.style.transformOrigin = `${origin.x}px ${origin.y}px`
    })

    // The ring's own spin (peril-ring-spin) and the per-group jitter
    // (peril-jitter, applied below by index.css to .peril-artwork's direct
    // children) both animate `transform` — one element can't run two
    // separate animations that each drive the same property, the later one
    // just overwrites the earlier one's value every frame. Wrapping the
    // ring in its own group gives jitter something to shake that isn't the
    // element already spinning, so the two compose instead of fighting.
    const ring = artworkRef.current.querySelector<SVGGElement>('#RotationRing')
    if (ring && ring.parentElement && !ring.parentElement.classList.contains('peril-ring-jitter-wrap')) {
      const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      wrap.setAttribute('class', 'peril-ring-jitter-wrap')
      ring.parentElement.insertBefore(wrap, ring)
      wrap.appendChild(ring)
    }
  }, [artworkHtml])

  // Flares the rune artwork itself (not just the overlaid number) the
  // instant its die settles — imperative because the artwork is raw
  // injected markup, not JSX we can className-toggle declaratively. Detects
  // "a new die just settled" by diffing the settled count against the
  // previous render rather than watching `values` directly, since `values`
  // also changes shape/count when the Peril Level changes.
  const prevSettledCountRef = useRef(0)
  useEffect(() => {
    const settledCount = values.filter((v) => v !== null).length
    if (settledCount > prevSettledCountRef.current && artworkRef.current) {
      const slotId = PERIL_SLOT_IDS[settledCount - 1]
      const el = artworkRef.current.querySelector<SVGGElement>(`#${slotId}`)
      if (el) {
        el.classList.remove('peril-rune-flare')
        void el.getBoundingClientRect()
        el.classList.add('peril-rune-flare')
      }
    }
    prevSettledCountRef.current = settledCount
  }, [values])

  // Tap/click reaction: the sigil flinches away from the hit, flashes red,
  // sends a shockwave out from the tap point, spikes the Rotation Ring's
  // spin, and its rune sockets flare outward from the impact. Imperative
  // (Web Animations API + class toggles) since most of what it moves is
  // raw injected artwork, and each tap needs its own direction.
  const svgRef = useRef<SVGSVGElement | null>(null)
  const flinchRef = useRef<SVGGElement | null>(null)
  const reactionAnimsRef = useRef<Animation[]>([])
  const reactionTimersRef = useRef<number[]>([])
  const lastTapRef = useRef(0)
  const tapStreakRef = useRef(0)
  const rippleIdRef = useRef(0)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])

  function getRingSpin() {
    const ring = artworkRef.current?.querySelector('#RotationRing')
    return ring?.getAnimations().find((a) => (a as CSSAnimation).animationName === 'peril-ring-spin')
  }

  function stopReaction() {
    reactionAnimsRef.current.forEach((a) => a.cancel())
    reactionAnimsRef.current = []
    reactionTimersRef.current.forEach((t) => window.clearTimeout(t))
    reactionTimersRef.current = []
    const spin = getRingSpin()
    if (spin) spin.playbackRate = 1
  }

  useEffect(() => stopReaction, [])

  function handleTap(e: ReactMouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return
    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY
    const { x, y } = point.matrixTransform(ctm.inverse())

    const now = performance.now()
    tapStreakRef.current = now - lastTapRef.current < TAP_STREAK_WINDOW_MS ? Math.min(tapStreakRef.current + 1, 7) : 1
    lastTapRef.current = now
    const intensity = Math.min(1 + 0.3 * (tapStreakRef.current - 1), 2.2)

    const id = ++rippleIdRef.current
    setRipples((prev) => [...prev.slice(-3), { id, x, y }])
    navigator.vibrate?.(tapStreakRef.current > 2 ? [20, 30, 40] : 25)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    stopReaction()

    const flinchEl = flinchRef.current
    if (flinchEl) {
      reactionAnimsRef.current.push(
        flinchEl.animate(buildFlinchKeyframes(x, y, intensity), { duration: 760 + 140 * (intensity - 1) }),
        flinchEl.animate(buildPainFlashKeyframes(intensity), { duration: 950 }),
      )
    }

    const spin = getRingSpin()
    if (spin) {
      spin.playbackRate = 6
      for (const [rate, at] of [[3.5, 220], [1.8, 520], [1, 900]] as const) {
        reactionTimersRef.current.push(
          window.setTimeout(() => {
            spin.playbackRate = rate
          }, at),
        )
      }
    }

    // Sockets nearest the hit flare first, the rest catching it outward.
    PERIL_SLOT_IDS.slice(0, count).forEach((slotId, i) => {
      const origin = PERIL_SLOT_ORIGINS[i]
      if (!origin) return
      const delay = Math.hypot(origin.x - x, origin.y - y) * 0.32
      reactionTimersRef.current.push(
        window.setTimeout(() => {
          const el = artworkRef.current?.querySelector<SVGGElement>(`#${slotId}`)
          if (!el) return
          el.classList.remove('peril-rune-flare')
          void el.getBoundingClientRect()
          el.classList.add('peril-rune-flare')
        }, delay),
      )
    })
  }

  const hiddenSlotIds = PERIL_SLOT_IDS.slice(count)
  // 0 at Peril Level 1 (no jitter at all) to 1 at Level 8 (full nervous
  // shake) — read by peril-jitter's keyframes via the --jitter custom
  // property, scaling every offset in that animation down to exactly zero
  // at the low end rather than just picking a smaller fixed amplitude.
  const jitterIntensity = (count - MIN_PERIL_LEVEL) / (MAX_PERIL_LEVEL - MIN_PERIL_LEVEL)

  return (
    <svg
      ref={svgRef}
      viewBox={PERIL_VIEW_BOX}
      className={`peril-sigil ${charged ? 'is-charged' : 'is-dormant'} ${rolling ? 'is-rolling' : ''}`}
      role="img"
      aria-label={total !== null ? `Peril total ${total}` : 'Peril sigil'}
      onClick={handleTap}
    >
      <defs>
        {/* A true colored glow, not just a blurred copy of the (white)
            source: blur the source's alpha shape, then flood-fill each
            blur with its own tint via feComposite "in", so the halo can be
            pink while the linework itself stays a constant white — like a
            neon tube's white-hot filament seen through its colored glass.
            Only the outer layer's flood-opacity animates (via SMIL, since
            CSS can't reach an attribute inside a <filter>) — the white
            core and the inner pink halo stay put, so the whole sigil reads
            as one steady light source breathing, not a flat brightness
            flicker across everything at once. */}
        <filter id="peril-neon-glow" x="-160%" y="-160%" width="420%" height="420%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="innerBlur" />
          {/* floodColor set via style, not as a bare "var(...)" attribute
              value — some mobile WebKit versions don't resolve CSS custom
              properties reliably when they're read as a plain XML/SVG
              presentation attribute rather than through the style/CSS
              cascade, which silently broke the whole glow on mobile. */}
          <feFlood style={{ floodColor: 'var(--warp-hot)' }} floodOpacity="0.95" result="innerColor" />
          <feComposite in="innerColor" in2="innerBlur" operator="in" result="innerGlow" />

          <feGaussianBlur in="SourceAlpha" stdDeviation="32" result="outerBlur" />
          <feFlood style={{ floodColor: 'var(--warp)' }} floodOpacity="0.75" result="outerColor">
            <animate attributeName="flood-opacity" values="0.5;0.95;0.5" dur="2.2s" repeatCount="indefinite" />
          </feFlood>
          <feComposite in="outerColor" in2="outerBlur" operator="in" result="outerGlow" />

          <feMerge>
            <feMergeNode in="outerGlow" />
            <feMergeNode in="outerGlow" />
            <feMergeNode in="innerGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* A soft dark-purple backdrop, not a light — sits behind the total
            (see peril-heart-backdrop below) and blots out the busy
            pentagram linework in that area so the bright total actually
            reads instead of fighting the artwork for contrast. */}
        <filter id="peril-total-backdrop" x="-250%" y="-250%" width="600%" height="600%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="34" result="blur" />
          <feFlood style={{ floodColor: 'var(--warp-shadow)' }} floodOpacity="0.92" result="darkColor" />
          <feComposite in="darkColor" in2="blur" operator="in" result="darkGlow" />
          <feMerge>
            <feMergeNode in="darkGlow" />
            <feMergeNode in="darkGlow" />
          </feMerge>
        </filter>
      </defs>

      {hiddenSlotIds.length > 0 && (
        <style>{hiddenSlotIds.map((id) => `#${id}{opacity:0}`).join('')}</style>
      )}

      <g ref={flinchRef} className="peril-flinch">
        {artworkHtml && (
          <g
            ref={artworkRef}
            className="peril-artwork"
            style={{ '--jitter': jitterIntensity } as CSSProperties}
            dangerouslySetInnerHTML={{ __html: artworkHtml }}
          />
        )}
      </g>

      {/* Shockwaves from each tap — outside the flinch group so they stay
          pinned to where the tap landed while the sigil recoils. */}
      <g aria-hidden="true">
        {ripples.map((r) => (
          <g key={r.id}>
            <circle className="peril-ripple" cx={r.x} cy={r.y} r={70} />
            <circle
              className="peril-ripple is-pain"
              cx={r.x}
              cy={r.y}
              r={70}
              onAnimationEnd={() => setRipples((prev) => prev.filter((p) => p.id !== r.id))}
            />
          </g>
        ))}
      </g>

      <g className="peril-overlay" textAnchor="middle" dominantBaseline="central">
        {values.map((value, i) => {
          const origin = PERIL_SLOT_ORIGINS[i]
          if (!origin) return null
          const isActive = activeIndex === i
          const isSettled = value !== null && !isActive
          return (
            <g key={i}>
              {/* A duplicate glyph, fully hidden behind the real number
                  below — only its animated drop-shadow escapes past the
                  edges, flaring on settle. Kept as pure drop-shadow (no
                  url()-filter mixed in) since animating that combination
                  didn't reliably interpolate. */}
              <text
                x={origin.x}
                y={origin.y}
                fontSize={70}
                fontFamily="var(--font-display)"
                className={`peril-slot-flare ${isSettled ? 'is-settled' : ''}`}
              >
                {value ?? ''}
              </text>
              <text
                x={origin.x}
                y={origin.y}
                fontSize={70}
                fontFamily="var(--font-display)"
                className={`peril-slot-number ${isActive ? 'is-active' : ''} ${isSettled ? 'is-settled' : ''}`}
              >
                {value ?? ''}
              </text>
            </g>
          )
        })}

        <text
          x={PERIL_CENTER.x}
          y={PERIL_CENTER.y}
          fontSize={200}
          fontFamily="var(--font-display)"
          className={`peril-heart-backdrop ${total !== null ? 'is-revealed' : ''}`}
          aria-hidden="true"
        >
          {total ?? ''}
        </text>
        <text
          x={PERIL_CENTER.x}
          y={PERIL_CENTER.y}
          fontSize={200}
          fontFamily="var(--font-display)"
          className={`peril-heart-total ${total !== null ? 'is-revealed' : ''}`}
        >
          {total ?? ''}
        </text>
      </g>
    </svg>
  )
}
