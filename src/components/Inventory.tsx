import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

type InventoryRow = Doc<'inventory'> & { characterName: string }
type Rarity = InventoryRow['rarity']

const RARITIES: Rarity[] = ['scrap', 'common', 'uncommon', 'rare', 'legendary']

const RARITY_GLYPH: Record<Rarity, string> = {
  scrap: '·',
  common: '○',
  uncommon: '◇',
  rare: '✦',
  legendary: '★',
}

// Ported from the old app's rarity palette (Tailwind arbitrary-value classes
// instead of CSS vars, since we don't carry that theme system over).
const RARITY_CLASSES: Record<Rarity, string> = {
  scrap: 'border-neutral-400 text-neutral-500 dark:border-neutral-600 dark:text-neutral-400',
  common: 'border-neutral-400 text-neutral-600 dark:border-neutral-500 dark:text-neutral-300',
  uncommon: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
  rare: 'border-sky-500 text-sky-600 dark:text-sky-400',
  legendary: 'border-amber-500 text-amber-600 dark:text-amber-400',
}

export function Inventory() {
  const rows = useQuery(api.inventory.listAll)
  const setSmelted = useMutation(api.inventory.setSmelted)
  const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null)
  const [showSmelted, setShowSmelted] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (rows === undefined) return null

  const smeltedCount = rows.filter((r) => r.smelted).length
  const baseRows = showSmelted ? rows : rows.filter((r) => !r.smelted)
  const tally = baseRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.rarity] = (acc[r.rarity] ?? 0) + 1
    return acc
  }, {})
  const visibleRows = rarityFilter ? baseRows.filter((r) => r.rarity === rarityFilter) : baseRows

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Inventory — all operators
        </h2>
        <span className="text-xs text-neutral-400">{visibleRows.length} entries</span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {RARITIES.map((r) => {
          const active = rarityFilter === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRarityFilter(active ? null : r)}
              className={`rounded-md border py-1.5 text-center transition-opacity ${RARITY_CLASSES[r]} ${
                active ? '' : rarityFilter ? 'opacity-40' : ''
              }`}
            >
              <div className="text-[9px] uppercase tracking-widest opacity-80">{r}</div>
              <div className="text-lg font-semibold leading-none">{tally[r] ?? 0}</div>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowSmelted((v) => !v)}
        className={`w-full rounded-md border py-1.5 text-xs font-medium tracking-widest uppercase transition-colors ${
          showSmelted
            ? 'border-red-500 text-red-600 dark:text-red-400'
            : 'border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400'
        }`}
      >
        {showSmelted ? `Hide Smelted (${smeltedCount})` : `Show Smelted (${smeltedCount})`}
      </button>

      {visibleRows.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          No relics recorded — complete an autopsy to begin the manifest.
        </p>
      ) : (
        <ul className="space-y-1">
          {visibleRows.map((row) => {
            const isExpanded = expandedId === row._id
            const colorClasses = row.smelted
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : RARITY_CLASSES[row.rarity]
            return (
              <li key={row._id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row._id)}
                  className={`flex w-full items-center gap-2 rounded-t-md border px-2 py-1.5 text-left ${
                    isExpanded ? 'rounded-b-none' : 'rounded-md'
                  } ${colorClasses}`}
                >
                  <span className="w-4 text-center text-base leading-none">
                    {RARITY_GLYPH[row.rarity]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.itemName}</div>
                    <div className="truncate text-[10px] tracking-wide opacity-75">
                      {row.characterName.toUpperCase()} · {row.source}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div
                    className={`rounded-b-md border border-t-0 px-3 py-3 text-sm ${colorClasses.split(' ')[0]} bg-neutral-100 dark:bg-neutral-900`}
                  >
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-neutral-400">Rarity</dt>
                      <dd className="uppercase">{row.rarity}</dd>
                      <dt className="text-neutral-400">Operator</dt>
                      <dd>{row.characterName}</dd>
                      <dt className="text-neutral-400">Source</dt>
                      <dd>{row.source}</dd>
                      {row.smelted && (
                        <>
                          <dt className="text-neutral-400">Status</dt>
                          <dd className="uppercase text-red-500">Smelted for resources</dd>
                        </>
                      )}
                    </dl>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSmelted({ inventoryId: row._id, smelted: !row.smelted })
                      }}
                      className="mt-3 w-full rounded-md border border-neutral-400 py-1.5 text-xs font-medium uppercase tracking-widest dark:border-neutral-600"
                    >
                      {row.smelted ? 'Restore Item' : 'Smelt Item'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
