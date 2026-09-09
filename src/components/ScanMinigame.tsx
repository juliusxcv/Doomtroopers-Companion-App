import { useMutation, useQuery } from 'convex/react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

// Placeholder minigame for Phase 1 — proves the resolve -> loot_drop ->
// realtime-broadcast pipeline. Real scan/dissect minigames replace the
// progress-bar interaction later without touching the resolve call itself.
export function ScanMinigame({ sessionId }: { sessionId: Id<'sessions'> }) {
  const monsters = useQuery(api.loot.listMonsters)
  const resolve = useMutation(api.loot.resolve)

  const [monsterSlug, setMonsterSlug] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (monsters && monsters.length > 0 && !monsterSlug) {
      setMonsterSlug(monsters[0].monsterSlug)
    }
  }, [monsters, monsterSlug])

  async function handleScanComplete() {
    setScanning(false)
    try {
      const { item, monsterName } = await resolve({ sessionId, monsterSlug })
      setMessage(`Found: ${item} (${monsterName})`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Scan failed.')
    }
  }

  if (monsters === undefined) return null

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Scan a body</h2>

      {monsters.length === 0 ? (
        <p className="text-sm text-neutral-500">No loot tables yet.</p>
      ) : (
        <>
          <select
            value={monsterSlug}
            onChange={(e) => setMonsterSlug(e.target.value)}
            disabled={scanning}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {monsters.map((m) => (
              <option key={m._id} value={m.monsterSlug}>
                {m.monsterName}
              </option>
            ))}
          </select>

          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            {scanning && (
              <motion.div
                className="h-full bg-neutral-900 dark:bg-neutral-100"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'linear' }}
                onAnimationComplete={handleScanComplete}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setMessage(null)
              setScanning(true)
            }}
            disabled={scanning}
            className="w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {scanning ? 'Scanning…' : 'Start Scan'}
          </button>

          {message && <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>}
        </>
      )}
    </div>
  )
}
