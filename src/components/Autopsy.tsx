import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

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

function SpecimenSelect({
  monsters,
  onSelect,
}: {
  monsters: Monster[]
  onSelect: (monsterId: string) => void
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Available specimens
      </h2>
      {monsters.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          Slab empty — no specimens synced from the vault yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {monsters.map((m) => {
            const displayName = isIdentified(m) ? m.name : m.code
            const showProgress = m.identifiedScansRequired > 0 && m.tierCount > 0
            const unlocked = showProgress ? unlockedTierCount(m.identifiedScansRequired, m.scanCount, m.tierCount) : 0
            return (
              <li key={m.monsterId}>
                <button
                  type="button"
                  onClick={() => onSelect(m.monsterId)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-left transition-colors hover:border-neutral-500 dark:border-neutral-700"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-neutral-400">{m.code}</span>
                    <span className="font-medium">{displayName}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {m.organPool.length} organs · {attemptsAllowed(m)} incisions
                    {m.identifiedScansRequired > 0 && (
                      <> · scans {m.scanCount}/{m.identifiedScansRequired}</>
                    )}
                  </div>
                  {showProgress && (
                    <div className="mt-1 flex gap-0.5">
                      {Array.from({ length: m.tierCount }, (_, i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full ${
                            i < unlocked ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type Phase = 'playing' | 'won' | 'lost'

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

  const [seed, setSeed] = useState(0)
  const solution = useMemo(() => generateSolution(palette, sequenceLen), [palette, sequenceLen, seed])
  const [guess, setGuess] = useState<(string | null)[]>(() => Array(sequenceLen).fill(null))
  const [history, setHistory] = useState<{ guess: string[]; feedback: SlotFeedback[] }[]>([])
  const [phase, setPhase] = useState<Phase>('playing')
  const [drops, setDrops] = useState<{ item: string; rarity: string }[] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setGuess(Array(sequenceLen).fill(null))
    setHistory([])
    setPhase('playing')
    setDrops(null)
  }, [seed, sequenceLen])

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
      setPhase(won ? 'won' : 'lost')
      setSubmitting(true)
      try {
        const result = await submitResult({
          monsterId: monster.monsterId,
          characterId,
          won,
          attemptsUsed: newHistory.length,
        })
        setDrops(result.drops)
      } finally {
        setSubmitting(false)
      }
    } else {
      setGuess(Array(sequenceLen).fill(null))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExit} className="text-xs text-neutral-500 underline">
          ‹ Choose another specimen
        </button>
        <span className="font-mono text-xs text-neutral-400">
          {isIdentified(monster) ? monster.name : monster.code}
        </span>
      </div>

      {monster.blurb && <p className="text-xs italic text-neutral-500 dark:text-neutral-400">{monster.blurb}</p>}

      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>Incisions</span>
          <span className="font-mono">{Math.max(0, attemptsLeft)}/{allowed}</span>
        </div>

        {/* Current guess slots */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {guess.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => clearSlot(i)}
              disabled={phase !== 'playing' || !g}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-300 text-lg dark:border-neutral-700"
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
                className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-300 text-lg transition-colors hover:border-neutral-500 dark:border-neutral-700"
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
            className="w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Submit
          </button>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-3 space-y-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-4 text-xs text-neutral-400">{i + 1}</span>
                {h.feedback.map((f, j) => (
                  <span
                    key={j}
                    className={`flex h-6 w-6 items-center justify-center rounded text-xs ${
                      f === 'hit'
                        ? 'bg-emerald-500 text-white'
                        : f === 'near'
                          ? 'bg-amber-400 text-white'
                          : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-800'
                    }`}
                  >
                    {f === 'hit' ? '✓' : f === 'near' ? '◐' : '✗'}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {phase !== 'playing' && (
          <div className="mt-3 space-y-2">
            <p className={`text-center text-sm font-medium ${phase === 'won' ? 'text-emerald-600' : 'text-red-500'}`}>
              {phase === 'won' ? 'Specimen identified' : 'Specimen ruined'}
            </p>
            {submitting ? (
              <p className="text-center text-xs text-neutral-400">Logging results…</p>
            ) : (
              <>
                {drops && drops.length > 0 ? (
                  <ul className="space-y-1">
                    {drops.map((d, i) => (
                      <li key={i} className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700">
                        {d.item} <span className="text-xs text-neutral-400">({d.rarity})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-xs text-neutral-400">Nothing recovered.</p>
                )}
                {isGM && drops && drops.length > 0 && (
                  <p className="text-center text-xs text-neutral-400">
                    (GM specimen — not logged to Inventory)
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSeed((n) => n + 1)}
                    className="flex-1 rounded-md border border-neutral-300 py-2 text-sm font-medium dark:border-neutral-700"
                  >
                    Scan again
                  </button>
                  <button
                    type="button"
                    onClick={onExit}
                    className="flex-1 rounded-md bg-neutral-900 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    Choose another
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
