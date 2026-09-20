import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadPerilArtwork, PERIL_CENTER, PERIL_SLOT_IDS, PERIL_SLOT_ORIGINS, PERIL_VIEW_BOX } from '../lib/perilArtwork'
import { MAX_PERIL_LEVEL, MIN_PERIL_LEVEL } from '../lib/perils'

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

  const hiddenSlotIds = PERIL_SLOT_IDS.slice(count)
  // 0 at Peril Level 1 (no jitter at all) to 1 at Level 8 (full nervous
  // shake) — read by peril-jitter's keyframes via the --jitter custom
  // property, scaling every offset in that animation down to exactly zero
  // at the low end rather than just picking a smaller fixed amplitude.
  const jitterIntensity = (count - MIN_PERIL_LEVEL) / (MAX_PERIL_LEVEL - MIN_PERIL_LEVEL)

  return (
    <svg
      viewBox={PERIL_VIEW_BOX}
      className={`peril-sigil ${charged ? 'is-charged' : 'is-dormant'} ${rolling ? 'is-rolling' : ''}`}
      role="img"
      aria-label={total !== null ? `Peril total ${total}` : 'Peril sigil'}
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
          <feFlood floodColor="var(--warp-hot)" floodOpacity="0.95" result="innerColor" />
          <feComposite in="innerColor" in2="innerBlur" operator="in" result="innerGlow" />

          <feGaussianBlur in="SourceAlpha" stdDeviation="32" result="outerBlur" />
          <feFlood floodColor="var(--warp)" floodOpacity="0.75" result="outerColor">
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
          <feFlood floodColor="var(--warp-shadow)" floodOpacity="0.92" result="darkColor" />
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

      {artworkHtml && (
        <g
          ref={artworkRef}
          className="peril-artwork"
          style={{ '--jitter': jitterIntensity } as CSSProperties}
          dangerouslySetInnerHTML={{ __html: artworkHtml }}
        />
      )}

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
