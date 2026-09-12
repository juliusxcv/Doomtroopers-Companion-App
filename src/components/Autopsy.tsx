import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { RARITY_TEXT, type Rarity } from '../lib/rarity'

type Monster = Doc<'monsters'>

// Fixed organ catalog — referenced by short code in each creature's vault
// frontmatter (`organs: [BRN, EYE, ...]`), not synced, since it's a stable
// universal list rather than per-monster data.
const ORGANS: Record<string, { glyph: string; name: string }> = {
  BRN: { glyph: 'Ψ', name: 'Brain' },
  HRT: { glyph: '♥', name: 'Heart' },
  LNG: { glyph: 'ϕ', name: 'Lung' },
  LVR: { glyph: 'Δ', name: 'Liver' },
  SPL: { glyph: 'Ω', name: 'Spleen' },
  EYE: { glyph: '◉', name: 'Eye' },
  TNG: { glyph: 'ϟ', name: 'Tongue' },
  GUT: { glyph: 'ξ', name: 'Gut-Coil' },
  MRW: { glyph: '✷', name: 'Marrow' },
}

// Tier-unlock curve, mirrored from convex/codex.ts so the progress bar shown
// here matches what the Codex actually gates.
const TIER_MULTIPLIERS = [1, 15, 45, 120]
function tierThreshold(base: number, tierIndex: number): number {
  const mult = TIER_MULTIPLIERS[tierIndex] ?? TIER_MULTIPLIERS[TIER_MULTIPLIERS.length - 1]
  return Math.max(0, Math.trunc(base)) * mult
}
function unlockedTierCount(base: number, scanCount: number, tierCount: number): number {
  let unlocked = 0
  for (let i = 0; i < tierCount; i++) {
    if (scanCount >= tierThreshold(base, i)) unlocked = i + 1
    else break
  }
  return unlocked
}

// Ported from the old app's per-creature autopsy table photos. Only the
// creatures we had a real image for (backed up before the source project
// was deleted, or bundled in the old app's build) have an entry here —
// others just render without one.
const CREATURE_IMAGES: Record<string, string> = {
  fleshspoil: '/creatures/fleshspoil.png',
  necromutant: '/creatures/necromutant.png',
  undead_legionnaire: '/creatures/undead_legionnaire.webp',
}

function attemptsAllowed(m: Monster): number {
  return Math.max(2, m.organPool.length + m.attemptsModifier)
}

function isIdentified(m: Monster): boolean {
  return m.identifiedScansRequired > 0 && m.scanCount >= m.identifiedScansRequired
}

function generateSolution(palette: string[], len: number): string[] {
  const out: string[] = []
  for (let i = 0; i < len; i++) out.push(palette[Math.floor(Math.random() * palette.length)])
  return out
}

type SlotFeedback = 'hit' | 'near' | 'miss'

function evaluateGuess(guess: string[], solution: string[]): SlotFeedback[] {
  const fb: SlotFeedback[] = solution.map(() => 'miss')
  const remaining: (string | null)[] = solution.slice()
  for (let i = 0; i < solution.length; i++) {
    if (guess[i] === solution[i]) {
      fb[i] = 'hit'
      remaining[i] = null
    }
  }
  for (let i = 0; i < solution.length; i++) {
    if (fb[i] === 'hit') continue
    const idx = remaining.indexOf(guess[i])
    if (idx !== -1) {
      fb[i] = 'near'
      remaining[idx] = null
    }
  }
  return fb
}

export function Autopsy({ characterId, isGM }: { characterId: Id<'characters'>; isGM: boolean }) {
  const monsters = useQuery(api.monsters.listAll)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (monsters === undefined) return null

  const selected = monsters.find((m) => m.monsterId === selectedId) ?? null

  if (!selected) {
    return <SpecimenSelect monsters={monsters} onSelect={setSelectedId} />
  }
  return (
    <AutopsySession
      monster={selected}
      characterId={characterId}
      isGM={isGM}
      onExit={() => setSelectedId(null)}
    />
  )
}

// Ported from the old app's ScanTierBar — a timeline with a diamond marker
// at each tier's scan threshold, so players can see exactly how many more
// scans the next level needs, not just an abstract filled/unfilled segment.
function ScanTierBar({
  scanCount,
  thresholds,
  unlocked,
  total,
}: {
  scanCount: number
  thresholds: number[]
  unlocked: number
  total: number
}) {
  const maxThreshold = thresholds[thresholds.length - 1] ?? 1
  const progressPct = Math.min(100, (scanCount / maxThreshold) * 100)
  const nextThreshold = unlocked < total ? thresholds[unlocked] : null
  const glow = '0 0 8px var(--color-phosphor), 0 0 14px color-mix(in oklab, var(--color-phosphor) 60%, transparent)'

  return (
    <div className="mt-2 border border-phosphor-faint p-2">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-widest uppercase">
        <span className={unlocked > 0 ? 'text-glow text-phosphor' : 'text-phosphor-dim'}>
          ◊ Dossier {unlocked}/{total}
        </span>
        <span className="text-phosphor-dim">
          {nextThreshold !== null ? `${scanCount}/${nextThreshold} scans › tier ${unlocked + 1}` : `${scanCount} scans`}
        </span>
      </div>
      <div className="relative h-8 px-1">
        <div className="absolute top-2 right-0 left-0 h-2 border border-phosphor-faint bg-black/40" />
        <div
          className="absolute top-2 left-0 h-2 bg-phosphor transition-[width] duration-700 ease-out"
          style={{ width: `${progressPct}%`, boxShadow: glow }}
        />
        {thresholds.map((t, i) => {
          const pct = Math.min(100, (t / maxThreshold) * 100)
          const reached = i < unlocked
          return (
            <div
              key={i}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pct}%` }}
              title={`Tier ${i + 1} @ ${t} scans`}
            >
              <div
                className={`mt-1.5 h-3 w-3 rotate-45 border transition-all duration-500 ${reached ? 'border-phosphor bg-phosphor' : 'border-phosphor-dim bg-ink'}`}
                style={reached ? { boxShadow: glow } : undefined}
              />
              <span
                className={`mt-1 font-mono text-[8px] leading-none tracking-widest transition-colors duration-500 ${
                  reached ? 'text-glow text-phosphor' : 'text-phosphor-dim'
                }`}
              >
                {t}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SpecimenSelect({
  monsters,
  onSelect,
}: {
  monsters: Monster[]
  onSelect: (monsterId: string) => void
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ Available Specimens ++
      </h2>
      {monsters.length === 0 ? (
        <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ Slab empty ◊
        </p>
      ) : (
        <ul className="space-y-1.5">
          {monsters.map((m) => {
            const displayName = isIdentified(m) ? m.name : m.code
            return (
              <li key={m.monsterId}>
                <button
                  type="button"
                  onClick={() => onSelect(m.monsterId)}
                  className="panel w-full px-3 py-2 text-left transition-colors hover:border-phosphor"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-phosphor-dim">{m.code}</span>
                    <span className="font-display text-glow text-lg text-phosphor">{displayName}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-bone-dim">
                    {m.organPool.length} organs · {attemptsAllowed(m)} incisions
                    {m.identifiedScansRequired > 0 && (
                      <> · scans {m.scanCount}/{m.identifiedScansRequired}</>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type Phase = 'playing' | 'progress' | 'won' | 'lost'

type ProgressAnim = {
  prevScanCount: number
  newScanCount: number
  prevUnlocked: number
  newUnlocked: number
}

// Timing for the post-scan reward beat: a short breath, then the bar fills
// (duration must match ScanTierBar's fill transition), then — if a tier was
// crossed — a celebration banner holds before the loot reveal.
const PROGRESS_FILL_DELAY = 300
const PROGRESS_FILL_DURATION = 700
const PROGRESS_CELEBRATE_HOLD = 1600
const PROGRESS_SETTLE_HOLD = 500

function AutopsySession({
  monster,
  characterId,
  isGM,
  onExit,
}: {
  monster: Monster
  characterId: Id<'characters'>
  isGM: boolean
  onExit: () => void
}) {
  const submitResult = useMutation(api.monsters.submitResult)
  const palette = monster.organPool
  const sequenceLen = palette.length
  const allowed = attemptsAllowed(monster)
  const showProgress = monster.identifiedScansRequired > 0 && monster.tierCount > 0
  const thresholds = showProgress
    ? Array.from({ length: monster.tierCount }, (_, i) => tierThreshold(monster.identifiedScansRequired, i))
    : []

  const [seed, setSeed] = useState(0)
  const solution = useMemo(() => generateSolution(palette, sequenceLen), [palette, sequenceLen, seed])
  const [guess, setGuess] = useState<(string | null)[]>(() => Array(sequenceLen).fill(null))
  const [history, setHistory] = useState<{ guess: string[]; feedback: SlotFeedback[] }[]>([])
  const [phase, setPhase] = useState<Phase>('playing')
  const [drops, setDrops] = useState<{ item: string; rarity: string }[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Scan count shown on the bar. Kept as local state (rather than reading
  // monster.scanCount directly) so a win can animate from the old count to
  // the new one instead of snapping the instant Convex's reactive query
  // updates — see the sync effect and the progressAnim effect below.
  const [displayScanCount, setDisplayScanCount] = useState(monster.scanCount)
  const [progressAnim, setProgressAnim] = useState<ProgressAnim | null>(null)
  const [celebrateTier, setCelebrateTier] = useState<number | null>(null)
  const isAnimatingRef = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setGuess(Array(sequenceLen).fill(null))
    setHistory([])
    setPhase('playing')
    setDrops(null)
    setProgressAnim(null)
    setCelebrateTier(null)
    isAnimatingRef.current = false
    setDisplayScanCount(monster.scanCount)
  }, [seed, sequenceLen])

  // Reflects other players' scans on the same specimen live while idle,
  // without clobbering our own in-flight reward animation.
  useEffect(() => {
    if (!isAnimatingRef.current) setDisplayScanCount(monster.scanCount)
  }, [monster.scanCount])

  const unlocked = showProgress
    ? unlockedTierCount(monster.identifiedScansRequired, displayScanCount, monster.tierCount)
    : 0

  // Drives the reward beat after a successful scan: fill the bar from the
  // old count to the new one, then — if that crossed a tier threshold —
  // hold on a celebration banner before handing off to the loot reveal.
  useEffect(() => {
    if (!progressAnim) return
    const tierUnlocked = progressAnim.newUnlocked > progressAnim.prevUnlocked
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setDisplayScanCount(progressAnim.newScanCount), PROGRESS_FILL_DELAY))
    const settleAt =
      PROGRESS_FILL_DELAY + PROGRESS_FILL_DURATION + (tierUnlocked ? PROGRESS_CELEBRATE_HOLD : PROGRESS_SETTLE_HOLD)
    if (tierUnlocked) {
      timers.push(
        setTimeout(
          () => setCelebrateTier(progressAnim.newUnlocked),
          PROGRESS_FILL_DELAY + PROGRESS_FILL_DURATION,
        ),
      )
    }
    timers.push(
      setTimeout(() => {
        isAnimatingRef.current = false
        setPhase('won')
      }, settleAt),
    )
    return () => timers.forEach(clearTimeout)
  }, [progressAnim])

  const attemptsUsed = history.length
  const attemptsLeft = allowed - attemptsUsed

  function placeOrgan(organId: string) {
    if (phase !== 'playing') return
    setGuess((prev) => {
      const idx = prev.findIndex((g) => g === null)
      if (idx === -1) return prev
      const next = prev.slice()
      next[idx] = organId
      return next
    })
  }

  function clearSlot(i: number) {
    if (phase !== 'playing') return
    setGuess((prev) => {
      const next = prev.slice()
      next[i] = null
      return next
    })
  }

  async function submit() {
    if (phase !== 'playing' || guess.some((g) => g === null)) return
    const completeGuess = guess as string[]
    const feedback = evaluateGuess(completeGuess, solution)
    const won = feedback.every((f) => f === 'hit')
    const newHistory = [...history, { guess: completeGuess, feedback }]
    setHistory(newHistory)

    if (won || newHistory.length >= allowed) {
      const willAnimateProgress = won && showProgress
      const prevScanCount = monster.scanCount
      const prevUnlocked = showProgress
        ? unlockedTierCount(monster.identifiedScansRequired, prevScanCount, monster.tierCount)
        : 0
      if (willAnimateProgress) isAnimatingRef.current = true
      setPhase(willAnimateProgress ? 'progress' : won ? 'won' : 'lost')
      setSubmitting(true)
      try {
        const result = await submitResult({
          monsterId: monster.monsterId,
          characterId,
          won,
          attemptsUsed: newHistory.length,
        })
        setDrops(result.drops)
        if (willAnimateProgress) {
          const newUnlocked = unlockedTierCount(monster.identifiedScansRequired, result.scanCount, monster.tierCount)
          setProgressAnim({ prevScanCount, newScanCount: result.scanCount, prevUnlocked, newUnlocked })
        }
      } finally {
        setSubmitting(false)
      }
    } else {
      setGuess(Array(sequenceLen).fill(null))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center font-mono text-xs tracking-widest text-phosphor-dim uppercase">
        {isIdentified(monster) ? monster.name : monster.code}
      </p>

      {CREATURE_IMAGES[monster.monsterId] && (
        <div className="panel overflow-hidden">
          <img
            src={CREATURE_IMAGES[monster.monsterId]}
            alt={`Autopsy table — ${monster.name}`}
            className="aspect-square w-full object-cover"
          />
        </div>
      )}

      {monster.blurb && <p className="font-body text-sm text-bone-dim italic">"{monster.blurb}"</p>}

      {showProgress && (
        <ScanTierBar scanCount={displayScanCount} thresholds={thresholds} unlocked={unlocked} total={monster.tierCount} />
      )}

      <div className="panel p-3">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
          <span>Incisions</span>
          <span className="text-bone">
            {Math.max(0, attemptsLeft)}/{allowed}
          </span>
        </div>

        {/* Current guess slots */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {guess.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => clearSlot(i)}
              disabled={phase !== 'playing' || !g}
              className="flex h-10 w-10 items-center justify-center border border-phosphor-faint text-lg text-phosphor"
            >
              {g ? ORGANS[g]?.glyph : ''}
            </button>
          ))}
        </div>

        {/* Organ palette */}
        {phase === 'playing' && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {palette.map((organId, i) => (
              <button
                key={`${organId}-${i}`}
                type="button"
                onClick={() => placeOrgan(organId)}
                title={ORGANS[organId]?.name ?? organId}
                className="flex h-10 w-10 items-center justify-center border border-phosphor-dim text-lg text-phosphor transition-colors hover:border-phosphor hover:bg-phosphor-faint"
              >
                {ORGANS[organId]?.glyph ?? organId}
              </button>
            ))}
          </div>
        )}

        {phase === 'playing' && (
          <button
            type="button"
            onClick={submit}
            disabled={guess.some((g) => g === null)}
            className="w-full border border-phosphor bg-phosphor-faint py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase transition hover:bg-phosphor/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit
          </button>
        )}

        {/* History — shows what was actually guessed in each slot, not just
            the feedback, so past attempts are usable for deduction. */}
        {history.length > 0 && (
          <div className="mt-3 space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-4 font-mono text-xs text-phosphor-dim">{i + 1}</span>
                {h.guess.map((organId, j) => {
                  const f = h.feedback[j]
                  return (
                    <span
                      key={j}
                      title={`${ORGANS[organId]?.name ?? organId} — ${f}`}
                      className={`flex h-7 w-7 items-center justify-center border text-base ${
                        f === 'hit'
                          ? 'border-phosphor bg-phosphor-faint text-phosphor'
                          : f === 'near'
                            ? 'border-brass bg-brass/15 text-brass'
                            : 'border-phosphor-faint text-bone-dim'
                      }`}
                    >
                      {ORGANS[organId]?.glyph ?? organId}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {phase !== 'playing' && (
          <div className="mt-3 space-y-2">
            <p
              className={`text-glow text-center font-display text-base uppercase ${
                phase === 'lost' ? 'text-sanguine' : 'text-phosphor'
              }`}
            >
              {phase === 'lost' ? 'Specimen Ruined' : 'Specimen Identified'}
            </p>

            {submitting ? (
              <p className="text-center font-mono text-xs text-bone-dim">Logging results…</p>
            ) : phase === 'progress' ? (
              celebrateTier !== null && (
                <div className="animate-tier-unlock animate-tier-glow border border-phosphor bg-phosphor-faint px-3 py-2 text-center">
                  <p className="text-glow font-display text-sm tracking-widest text-phosphor uppercase">
                    ◆ Dossier Tier {celebrateTier} Unlocked ◆
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-widest text-phosphor-dim uppercase">
                    New Autopsy Report Available
                  </p>
                </div>
              )
            ) : (
              <>
                {drops && drops.length > 0 ? (
                  <ul className="space-y-1">
                    {drops.map((d, i) => {
                      const rarity = d.rarity as Rarity
                      return (
                        <li key={i} className="panel flex items-center justify-between px-2 py-1.5 font-mono text-sm">
                          <span className="text-bone">{d.item}</span>
                          <span className={`text-xs tracking-widest uppercase ${RARITY_TEXT[rarity]}`}>
                            {rarity}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-center font-mono text-xs text-bone-dim">Nothing recovered.</p>
                )}
                {isGM && drops && drops.length > 0 && (
                  <p className="text-center font-mono text-[10px] text-bone-dim">
                    (GM specimen — not logged to Inventory)
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setSeed((n) => n + 1)}
                  className="w-full border border-phosphor bg-phosphor-faint py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase hover:bg-phosphor/20"
                >
                  Scan again
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onExit}
        className="w-full border border-phosphor-dim py-2 font-mono text-xs font-medium tracking-widest text-bone uppercase hover:border-phosphor"
      >
        ‹ Choose Another Specimen
      </button>
    </div>
  )
}
