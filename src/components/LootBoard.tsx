import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

// Renders live for every player in the session — this is requirement #1
// (loot must be accessible/interactable by everyone) proven end to end.
export function LootBoard({
  sessionId,
  playerId,
}: {
  sessionId: Id<'sessions'>
  playerId: Id<'players'>
}) {
  const drops = useQuery(api.loot.listForSession, { sessionId })
  const claim = useMutation(api.loot.claim)
  const [error, setError] = useState<string | null>(null)

  async function handleClaim(dropId: Id<'loot_drops'>) {
    setError(null)
    try {
      await claim({ dropId, playerId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim that.')
    }
  }

  if (drops === undefined) return null

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Loot ({drops.length})
      </h2>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {drops.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Nothing yet — scan a body to find something.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {drops.map((drop) => (
            <li key={drop._id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {drop.item}
                <span className="ml-2 text-xs text-neutral-400">from {drop.monsterName}</span>
              </span>
              {drop.claimedByName ? (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Claimed by {drop.claimedByName}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleClaim(drop._id)}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium dark:border-neutral-700"
                >
                  Claim
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
