import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { AbilitiesList, StatsAndWeapons } from './StatBlock'

type Monster = Doc<'monsters'>

// Name and stat-card content (loadouts/abilities) are both gated behind
// identification — the same LVL 1 Autopsy threshold — for both GM and
// players. The server (convex/monsters.ts) already strips loadouts/
// abilities when this is false, so this is just for deciding what message
// to show, not an access check.
function isIdentified(m: Monster): boolean {
  return m.identifiedScansRequired > 0 && m.scanCount >= m.identifiedScansRequired
}

export function Bestiary({ onViewCodexEntry }: { onViewCodexEntry?: (slug: string) => void }) {
  const monsters = useQuery(api.monsters.listAll)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (monsters === undefined) return null

  const selected = monsters.find((m) => m.monsterId === selectedId) ?? null

  if (!selected) {
    return <BestiaryList monsters={monsters} onSelect={setSelectedId} />
  }
  return <StatCard monster={selected} onExit={() => setSelectedId(null)} onViewCodexEntry={onViewCodexEntry} />
}

function BestiaryList({ monsters, onSelect }: { monsters: Monster[]; onSelect: (monsterId: string) => void }) {
  return (
    <div className="space-y-2">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ Bestiary ++
      </h2>
      {monsters.length === 0 ? (
        <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ No specimens catalogued ◊
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
                  className="panel flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:border-phosphor"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-phosphor-dim">{m.code}</span>
                    <span className="text-glow font-display text-lg text-phosphor">{displayName}</span>
                  </span>
                  <span className="font-mono text-phosphor-dim">›</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StatCard({
  monster,
  onExit,
  onViewCodexEntry,
}: {
  monster: Monster
  onExit: () => void
  onViewCodexEntry?: (slug: string) => void
}) {
  const codexEntry = useQuery(api.codex.findEntryByMonster, { monsterId: monster.monsterId })
  const identified = isIdentified(monster)
  const displayName = identified ? monster.name : monster.code
  const loadouts = monster.loadouts ?? []
  const hasAbilities = monster.abilities && monster.abilities.length > 0
  const hasCard = loadouts.length > 0 || hasAbilities

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="font-mono text-xs tracking-widest text-phosphor-dim uppercase">{monster.code}</p>
        <h2 className="text-glow font-display text-2xl text-phosphor">{displayName}</h2>
      </div>

      {monster.blurb && <p className="text-center font-body text-sm text-bone-dim italic">"{monster.blurb}"</p>}

      {codexEntry && onViewCodexEntry && (
        <button
          type="button"
          onClick={() => onViewCodexEntry(codexEntry.slug)}
          className="w-full border border-phosphor-dim py-1.5 font-mono text-[11px] font-medium tracking-widest text-bone-dim uppercase hover:border-phosphor hover:text-bone"
        >
          ◊ View Autopsy Report ›
        </button>
      )}

      {!identified ? (
        <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ Not yet identified — needs more successful scans ◊
        </p>
      ) : (
        <>
          {/* A single unnamed loadout (the common case) renders flat; a
              squad-type creature with several named loadouts (e.g. Undead
              Mutant's Sergeant/Grenadier/Trooper/...) gets a collapsible
              section per loadout instead, first one open by default. */}
          {loadouts.length === 1 && !loadouts[0].name ? (
            <div className="panel p-3">
              <StatsAndWeapons stats={loadouts[0].stats} weapons={loadouts[0].weapons} />
            </div>
          ) : (
            loadouts.map((l, i) => (
              <details key={i} className="panel p-3" open={i === 0}>
                <summary className="cursor-pointer font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
                  {l.name || `Loadout ${i + 1}`}
                </summary>
                <div className="mt-2">
                  <StatsAndWeapons stats={l.stats} weapons={l.weapons} />
                </div>
              </details>
            ))
          )}

          {hasAbilities && <AbilitiesList abilities={monster.abilities!} />}

          {!hasCard && (
            <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
              ◊ No stat data catalogued ◊
            </p>
          )}
        </>
      )}

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
