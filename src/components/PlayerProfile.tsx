import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { RARITIES, RARITY_BORDER, RARITY_GLYPH, RARITY_TEXT, type Rarity } from '../lib/rarity'
import { initials, PORTRAITS } from '../lib/portraits'
import { AbilitiesList, StatsAndWeapons } from './StatBlock'
import { TabBar } from './TabBar'
import { VideoLink } from './VideoLink'

// Mirrors characters.listProfiles/getProfile's computed shape (roster
// fields + campaign stats derived from real play data) — see convex/characters.ts.
type Profile = Doc<'characters'> & {
  autopsiesCompleted: number
  itemsRecovered: number
  scrap: number
  components: number
}
type Companion = NonNullable<Doc<'characters'>['companions']>[number]
type SubTab = 'stats' | 'abilities' | 'inventory' | 'lore'

// A roster-wide list rather than a single card — the logged-in operator's
// own dossier opens by default (per the user's own request: least clicks
// for the thing you look at every session) but every other operator is one
// tap away, browsable the same way the Bestiary lets you browse specimens.
export function PlayerProfile({ characterId }: { characterId: Id<'characters'> }) {
  const profiles = useQuery(api.characters.listProfiles)

  if (profiles === undefined) return null

  const sorted = [...profiles].sort((a, b) => {
    if (a._id === characterId) return -1
    if (b._id === characterId) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-3">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ Operator Profile ++
      </h2>

      <div className="space-y-2">
        {sorted.map((p) => (
          <CharacterCard key={p._id} profile={p} isMe={p._id === characterId} />
        ))}
      </div>
    </div>
  )
}

function CharacterCard({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const [tab, setTab] = useState<SubTab>('stats')
  const portrait = PORTRAITS[profile.name]

  return (
    <details className="panel" open={isMe}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden bg-panel-raised">
          {portrait ? (
            <img src={portrait} alt={profile.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-glow font-display text-lg text-phosphor-dim">{initials(profile.name)}</span>
            </div>
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="text-glow block truncate font-display text-lg text-phosphor">
            {profile.name}
            {isMe && <span className="ml-1.5 font-mono text-[9px] tracking-widest text-brass">YOU</span>}
          </span>
          {profile.playerRealName && (
            <span className="block truncate font-mono text-[11px] text-bone-dim">{profile.playerRealName}</span>
          )}
        </span>
        <span className="font-mono text-phosphor-dim">▾</span>
      </summary>

      <div className="space-y-3 border-t border-phosphor-faint p-3">
        <TabBar
          tabs={
            [
              { key: 'stats', label: 'Stats' },
              { key: 'abilities', label: 'Abilities' },
              { key: 'inventory', label: 'Inventory' },
              { key: 'lore', label: 'Lore' },
            ] as const
          }
          value={tab}
          onChange={setTab}
        />

        {tab === 'stats' && <StatsTab profile={profile} />}
        {tab === 'abilities' && <AbilitiesTab profile={profile} />}
        {tab === 'inventory' && <InventoryTab profile={profile} />}
        {tab === 'lore' && <LoreTab profile={profile} />}
      </div>
    </details>
  )
}

function StatsTab({ profile }: { profile: Profile }) {
  const hasWeapons = profile.weapons && (profile.weapons.ranged.length > 0 || profile.weapons.melee.length > 0)
  const hasCompanions = profile.companions && profile.companions.length > 0
  const hasCombatCard = profile.stats || hasWeapons || hasCompanions

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1">
        {[
          { label: 'Autopsies', value: profile.autopsiesCompleted },
          { label: 'Recovered', value: profile.itemsRecovered },
          { label: 'Scrap', value: profile.scrap },
          { label: 'Components', value: profile.components },
        ].map(({ label, value }) => (
          <div key={label} className="panel-raised py-1.5 text-center">
            <div className="font-mono text-[8px] tracking-widest text-phosphor-dim uppercase">{label}</div>
            <div className="text-glow font-display text-lg leading-none text-phosphor">{value}</div>
          </div>
        ))}
      </div>

      {profile.stats && (
        <div className="panel-raised p-3">
          <StatsAndWeapons stats={profile.stats} weapons={profile.weapons ?? { ranged: [], melee: [] }} />
        </div>
      )}

      {hasCompanions &&
        profile.companions!.map((c, i) => (
          <div key={i} className="panel-raised p-3">
            <div className="mb-2 font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
              ◊ Companion — {c.name}
            </div>
            <StatsAndWeapons stats={c.stats} weapons={c.weapons} />
          </div>
        ))}

      {!hasCombatCard && (
        <p className="py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ No stat data catalogued ◊
        </p>
      )}
    </div>
  )
}

function AbilitiesTab({ profile }: { profile: Profile }) {
  const hasAbilities = profile.abilities && profile.abilities.length > 0
  const companionsWithAbilities = (profile.companions ?? []).filter(
    (c): c is Companion & { abilities: NonNullable<Companion['abilities']> } =>
      !!c.abilities && c.abilities.length > 0,
  )

  if (!hasAbilities && companionsWithAbilities.length === 0) {
    return (
      <p className="py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
        ◊ No abilities catalogued ◊
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {hasAbilities && <AbilitiesList abilities={profile.abilities!} />}
      {companionsWithAbilities.map((c, i) => (
        <div key={i}>
          <div className="mb-1 font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
            ◊ Companion — {c.name}
          </div>
          <AbilitiesList abilities={c.abilities} />
        </div>
      ))}
    </div>
  )
}

// Scoped down from the old app-wide Reliquary Manifest (now retired — see
// Inventory.tsx's removal) to just this operator's own recovered items.
// Resource totals (scrap/components) already surface on the Stats tab, so
// no separate stockpile summary is repeated here.
function InventoryTab({ profile }: { profile: Profile }) {
  const rows = useQuery(api.inventory.listAll)
  const setSmelted = useMutation(api.inventory.setSmelted)
  const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null)
  const [showSmelted, setShowSmelted] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (rows === undefined) return null

  const myRows = rows.filter((r) => r.characterId === profile._id)
  const smeltedCount = myRows.filter((r) => r.smelted).length
  const baseRows = showSmelted ? myRows : myRows.filter((r) => !r.smelted)
  const tally = baseRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.rarity] = (acc[r.rarity] ?? 0) + 1
    return acc
  }, {})
  const visibleRows = rarityFilter ? baseRows.filter((r) => r.rarity === rarityFilter) : baseRows

  return (
    <div className="space-y-2">
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
                    <div className="truncate font-mono text-[10px] tracking-wide text-bone-dim">{row.source}</div>
                  </div>
                </button>

                {isExpanded && (
                  <div className={`border border-t-0 bg-panel-raised px-3 py-3 text-sm ${borderClass}`}>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                      <dt className="text-phosphor-dim">Rarity</dt>
                      <dd className={`uppercase ${textClass}`}>{row.rarity}</dd>
                      <dt className="text-phosphor-dim">Source</dt>
                      <dd className="text-bone">{row.source}</dd>
                      {row.smelted && (
                        <>
                          <dt className="text-phosphor-dim">Status</dt>
                          <dd className="text-sanguine uppercase">
                            Smelted — {row.smeltedScrap ?? 0} scrap, {row.smeltedComponents ?? 0} components
                          </dd>
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

function LoreTab({ profile }: { profile: Profile }) {
  if (!profile.dossier && !profile.videoId) {
    return (
      <p className="py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
        ◊ No dossier on file ◊
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {profile.videoId && <VideoLink videoId={profile.videoId} label="Dossier Trailer" />}
      {profile.dossier && (
        <div className="prose-lore">
          <Markdown>{profile.dossier}</Markdown>
        </div>
      )}
    </div>
  )
}
