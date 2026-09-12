import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { RARITIES, RARITY_BORDER, RARITY_GLYPH, RARITY_TEXT, type Rarity } from '../lib/rarity'

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
        <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
          ++ Reliquary Manifest ++
        </h2>
        <span className="font-mono text-[11px] text-bone-dim">{visibleRows.length} entries</span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {RARITIES.map((r) => {
          const active = rarityFilter === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRarityFilter(active ? null : r)}
              className={`border py-1.5 text-center transition-opacity ${RARITY_BORDER[r]} ${RARITY_TEXT[r]} ${
                active ? 'bg-panel-raised' : rarityFilter ? 'opacity-40' : ''
              }`}
            >
              <div className="font-mono text-[8px] tracking-widest uppercase opacity-80">{r}</div>
              <div className="font-display text-lg leading-none">{tally[r] ?? 0}</div>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowSmelted((v) => !v)}
        className={`w-full border py-1.5 font-mono text-[11px] font-medium tracking-widest uppercase transition-colors ${
          showSmelted ? 'border-sanguine text-sanguine' : 'border-phosphor-dim text-bone-dim'
        }`}
      >
        {showSmelted ? `Hide Smelted (${smeltedCount})` : `Show Smelted (${smeltedCount})`}
      </button>

      {visibleRows.length === 0 ? (
        <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          No relics recorded
        </p>
      ) : (
        <ul className="space-y-1">
          {visibleRows.map((row) => {
            const isExpanded = expandedId === row._id
            const borderClass = row.smelted ? 'border-sanguine' : RARITY_BORDER[row.rarity]
            const textClass = row.smelted ? 'text-sanguine' : RARITY_TEXT[row.rarity]
            return (
              <li key={row._id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row._id)}
                  className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left ${borderClass}`}
                >
                  <span className={`w-4 text-center text-base leading-none ${textClass}`}>
                    {RARITY_GLYPH[row.rarity]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-mono text-sm ${textClass}`}>{row.itemName}</div>
                    <div className="truncate font-mono text-[10px] tracking-wide text-bone-dim">
                      {row.characterName.toUpperCase()} · {row.source}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className={`border border-t-0 bg-panel-raised px-3 py-3 text-sm ${borderClass}`}>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                      <dt className="text-phosphor-dim">Rarity</dt>
                      <dd className={`uppercase ${textClass}`}>{row.rarity}</dd>
                      <dt className="text-phosphor-dim">Operator</dt>
                      <dd className="text-bone">{row.characterName}</dd>
                      <dt className="text-phosphor-dim">Source</dt>
                      <dd className="text-bone">{row.source}</dd>
                      {row.smelted && (
                        <>
                          <dt className="text-phosphor-dim">Status</dt>
                          <dd className="text-sanguine uppercase">Smelted for resources</dd>
                        </>
                      )}
                    </dl>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSmelted({ inventoryId: row._id, smelted: !row.smelted })
                      }}
                      className="mt-3 w-full border border-phosphor-dim py-1.5 font-mono text-xs font-medium tracking-widest text-bone uppercase hover:border-phosphor"
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
