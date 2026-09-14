import { useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { lookupPeril, MAX_PERIL_LEVEL, MIN_PERIL_LEVEL, type Peril as PerilEntry } from '../lib/perils'

// How long the dice flicker through random faces before settling on the
// real (server-rolled) result — pure showmanship, the actual roll already
// happened server-side by the time this fires. See handleRoll below.
const FLICKER_MS = 900
const FLICKER_TICK_MS = 70
// Extra hold after the dice land before the reveal card animates in, so the
// total has a beat to register before the named Peril appears.
const SETTLE_HOLD_MS = 550

type Phase = 'idle' | 'rolling' | 'revealed'

// Feature wrapper for Vexilia's Peril gauge — reached from the Main Menu
// only by her own player or the GM (see App.tsx). Always operates on Vex's
// own character row regardless of who's viewing, since a GM opening this
// screen is managing Vex's gauge, not their own.
export function Peril() {
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

  return <PerilCheck characterId={vex._id} />
}

function PerilCheck({ characterId }: { characterId: Id<'characters'> }) {
  const state = useQuery(api.perils.getState, { characterId })
  const setLevel = useMutation(api.perils.setLevel)
  const roll = useMutation(api.perils.roll)

  const [phase, setPhase] = useState<Phase>('idle')
  const [diceFaces, setDiceFaces] = useState<number[]>([])
  const [result, setResult] = useState<{ dice: number[]; total: number; peril: PerilEntry } | null>(null)
  const flickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (flickerRef.current) clearInterval(flickerRef.current)
    }
  }, [])

  const level = state?.level ?? MIN_PERIL_LEVEL

  async function handleRoll() {
    if (phase === 'rolling') return
    setPhase('rolling')
    setResult(null)
    setDiceFaces(Array.from({ length: level }, () => 1 + Math.floor(Math.random() * 6)))

    flickerRef.current = setInterval(() => {
      setDiceFaces(Array.from({ length: level }, () => 1 + Math.floor(Math.random() * 6)))
    }, FLICKER_TICK_MS)

    const [res] = await Promise.all([
      roll({ characterId }),
      new Promise<void>((resolve) => setTimeout(resolve, FLICKER_MS)),
    ])

    if (flickerRef.current) clearInterval(flickerRef.current)
    setDiceFaces(res.dice)

    setTimeout(() => {
      setResult({ dice: res.dice, total: res.total, peril: lookupPeril(res.total) })
      setPhase('revealed')
    }, SETTLE_HOLD_MS)
  }

  const displayedDice = phase === 'idle' ? Array.from({ length: level }, () => null) : diceFaces
  const displayedTotal = phase === 'rolling' ? diceFaces.reduce((sum, d) => sum + d, 0) : result?.total

  return (
    <div className="space-y-3">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ Peril Check ++
      </h2>
      <p className="font-body text-sm text-bone-dim italic">
        Vexilia's grip on the warp is not absolute. Every power drawn upon leaves a residue — the deeper she reaches,
        the more dice haunt the throw.
      </p>

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
                    onClick={() => setLevel({ characterId, level: n })}
                    className={`peril-level-btn ${n === level ? 'is-active' : ''}`}
                  >
                    {n}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 py-1">
            {displayedDice.map((face, i) => (
              <div
                key={i}
                className={`peril-die ${phase === 'rolling' ? 'is-rolling' : ''} ${phase === 'revealed' ? 'is-final' : ''}`}
                style={{ animationDelay: `${i * 25}ms` }}
              >
                <span>{face ?? ''}</span>
              </div>
            ))}
          </div>

          {phase !== 'idle' && (
            <div className="text-center">
              <p className="peril-warp-text-dim font-mono text-[9px] tracking-[0.4em] uppercase">Peril Total</p>
              <p className="peril-total-glow font-display text-4xl">{displayedTotal}</p>
            </div>
          )}

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
          updates reactively) well before the flicker suspense animation
          finishes, so showing it live would spoil the reveal. */}
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
