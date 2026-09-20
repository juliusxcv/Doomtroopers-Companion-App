import { useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { lookupPeril, MAX_PERIL_LEVEL, MIN_PERIL_LEVEL, type Peril as PerilEntry } from '../lib/perils'
import { PerilSigil } from './PerilSigil'

// Each die lands one at a time, clockwise around the sigil, before the
// total appears at its heart — pure showmanship, since the real roll
// already happened server-side in one round trip (see handleRoll). Tuned
// so a full 8-die roll still resolves in well under 4s.
const FLICKER_PER_DIE_MS = 320
const FLICKER_TICK_MS = 60
const GAP_BETWEEN_DICE_MS = 130
const TOTAL_REVEAL_DELAY_MS = 400
const CARD_REVEAL_DELAY_MS = 600

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

type Phase = 'idle' | 'rolling' | 'revealed'

// Feature wrapper for Vexilia's Peril gauge — reached from the Main Menu
// only by her own player or the GM (see App.tsx). Always operates on Vex's
// own character row regardless of who's viewing, since a GM opening this
// screen is managing Vex's gauge, not their own. `viewerCharacterId`/`isGM`
// identify whoever is actually using the screen, so a GM's rolls can be
// excluded from Vex's real Peril log (see convex/perils.ts:roll).
export function Peril({ viewerCharacterId, isGM }: { viewerCharacterId: Id<'characters'>; isGM: boolean }) {
  const characters = useQuery(api.characters.list)
  const vex = characters?.find((c) => c.name === 'Vexilia Thornkell')

  if (characters === undefined) return null
  if (!vex) {
    return (
      <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
        ◊ Vexilia Thornkell not found in roster ◊
      </p>
    )
  }

  return <PerilCheck characterId={vex._id} actingCharacterId={viewerCharacterId} isGM={isGM} />
}

function PerilCheck({
  characterId,
  actingCharacterId,
  isGM,
}: {
  characterId: Id<'characters'>
  actingCharacterId: Id<'characters'>
  isGM: boolean
}) {
  const state = useQuery(api.perils.getState, { characterId })
  const setLevel = useMutation(api.perils.setLevel)
  const roll = useMutation(api.perils.roll)

  const [phase, setPhase] = useState<Phase>('idle')
  // Dice that have already landed, in clockwise order — index i corresponds
  // to the sigil's i-th slot.
  const [settledDice, setSettledDice] = useState<number[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [activeFace, setActiveFace] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [result, setResult] = useState<{ dice: number[]; total: number; peril: PerilEntry } | null>(null)
  // How many dice the *in-flight* roll actually has, frozen at roll time —
  // the reactive gauge level (below) can change mid-animation if someone
  // else adjusts it, and the sigil must keep drawing the ring it already
  // started animating rather than reshuffling its slot count underneath it.
  const [rolledCount, setRolledCount] = useState<number | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    // Reset on every (re)mount, not just declared once via useRef's initial
    // value — StrictMode's dev-only mount→cleanup→remount cycle would
    // otherwise set this true during the synthetic cleanup and leave it
    // stuck true forever, silently killing every future handleRoll before
    // its first await resolves.
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  const level = state?.level ?? MIN_PERIL_LEVEL
  // Frozen only while a roll is actually animating — once revealed (or back
  // to idle), the ring should track the live level again so changing it
  // ahead of the next roll previews the new slot count immediately.
  const displayCount = phase === 'rolling' ? (rolledCount ?? level) : level

  // Clears any previous roll's dice/total off the sigil — used both at the
  // start of a fresh roll and whenever the level changes, since picking a
  // different Peril Level should preview an empty ring at the new size, not
  // leave the last roll's result sitting on top of it.
  function resetSigilState() {
    setPhase('idle')
    setResult(null)
    setTotal(null)
    setSettledDice([])
    setActiveIndex(null)
    setActiveFace(null)
    setRolledCount(null)
  }

  function handleSetLevel(n: number) {
    resetSigilState()
    setLevel({ characterId, level: n })
  }

  async function handleRoll() {
    if (phase === 'rolling') return
    setPhase('rolling')
    setResult(null)
    setTotal(null)
    setSettledDice([])
    setActiveIndex(null)
    setActiveFace(null)

    // The real roll happens now, in one server round trip — everything
    // below is just replaying that already-known result one die at a time.
    const res = await roll({ characterId, actingCharacterId })
    if (cancelledRef.current) return
    setRolledCount(res.dice.length)

    for (let i = 0; i < res.dice.length; i++) {
      setActiveIndex(i)
      const flickerUntil = Date.now() + FLICKER_PER_DIE_MS
      while (Date.now() < flickerUntil) {
        setActiveFace(1 + Math.floor(Math.random() * 6))
        await sleep(FLICKER_TICK_MS)
        if (cancelledRef.current) return
      }
      setActiveFace(null)
      setActiveIndex(null)
      setSettledDice((prev) => [...prev, res.dice[i]])
      await sleep(GAP_BETWEEN_DICE_MS)
      if (cancelledRef.current) return
    }

    await sleep(TOTAL_REVEAL_DELAY_MS)
    if (cancelledRef.current) return
    setTotal(res.total)

    await sleep(CARD_REVEAL_DELAY_MS)
    if (cancelledRef.current) return
    setResult({ dice: res.dice, total: res.total, peril: lookupPeril(res.total) })
    setPhase('revealed')
  }

  const slotValues: (number | null)[] = Array.from({ length: displayCount }, (_, i) => {
    if (i < settledDice.length) return settledDice[i]
    if (i === activeIndex) return activeFace
    return null
  })

  return (
    <div className="space-y-3">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ Peril Check ++
      </h2>
      <p className="font-body text-sm text-bone-dim italic">
        Vexilia's grip on the warp is not absolute. Every power drawn upon leaves a residue — the deeper she reaches,
        the more dice haunt the throw.
      </p>

      {isGM && (
        <p className="panel px-3 py-2 text-center font-mono text-[11px] tracking-widest text-bone-dim uppercase">
          ◊ GM roll — not logged to Vexilia's Peril history ◊
        </p>
      )}

      <div className="peril-scene">
        <div className="peril-panel space-y-4 p-4">
          <div>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-[0.3em] uppercase">
              <span className="peril-warp-text">Peril Level</span>
              <span className="text-bone-dim">{level}D6</span>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: MAX_PERIL_LEVEL - MIN_PERIL_LEVEL + 1 }, (_, i) => MIN_PERIL_LEVEL + i).map(
                (n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={phase === 'rolling'}
                    onClick={() => handleSetLevel(n)}
                    className={`peril-level-btn ${n === level ? 'is-active' : ''}`}
                  >
                    {n}
                  </button>
                ),
              )}
            </div>
          </div>

          <PerilSigil
            count={displayCount}
            values={slotValues}
            activeIndex={activeIndex}
            total={total}
            charged={phase !== 'idle'}
            rolling={phase === 'rolling'}
          />

          <button type="button" onClick={handleRoll} disabled={phase === 'rolling'} className="peril-roll-btn w-full">
            {phase === 'rolling' ? 'Channeling…' : phase === 'revealed' ? 'Roll Again' : 'Roll Peril'}
          </button>
        </div>
      </div>

      {phase === 'revealed' && result && (
        <div className="peril-reveal peril-reveal-in space-y-2 p-4">
          <p className="peril-warp-text text-center font-mono text-[10px] tracking-[0.3em] uppercase">
            ◈ Peril Manifests ◈
          </p>
          <p className="peril-warp-glow text-center font-display text-2xl uppercase">{result.peril.name}</p>
          {result.peril.text && (
            <p className="text-center font-body text-sm text-bone-dim italic">"{result.peril.text}"</p>
          )}
          {result.peril.consequence && (
            <div className="mt-2 border-t border-phosphor-faint pt-2">
              <p className="mb-1 font-mono text-[9px] tracking-[0.3em] text-bone-dim uppercase">Consequence</p>
              <p className="font-mono text-sm text-bone">{result.peril.consequence}</p>
            </div>
          )}
        </div>
      )}

      {/* Hidden while rolling — the roll mutation resolves (and this list
          updates reactively) well before the dice finish landing, so
          showing it live would spoil the reveal. */}
      {phase !== 'rolling' && state && state.rolls.length > 0 && (
        <div className="space-y-1">
          <p className="font-mono text-[10px] tracking-widest text-phosphor-dim uppercase">Recent Perils</p>
          <ul className="space-y-1">
            {state.rolls.map((r) => {
              const p = lookupPeril(r.total)
              return (
                <li key={r._id} className="panel flex items-center justify-between px-2 py-1.5 font-mono text-xs">
                  <span className="text-bone-dim">
                    {r.level}D6 → {r.total}
                  </span>
                  <span className="text-bone">{p.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
