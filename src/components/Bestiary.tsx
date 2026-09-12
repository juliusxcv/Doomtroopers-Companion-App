import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

type Monster = Doc<'monsters'>
type Weapon = { name: string; atk: string; dmg: string; wr: string }
type Loadout = NonNullable<Monster['loadouts']>[number]

// Name and stat-card content (loadouts/abilities) are both gated behind
// identification — the same LVL 1 Autopsy threshold — for both GM and
// players. The server (convex/monsters.ts) already strips loadouts/
// abilities when this is false, so this is just for deciding what message
// to show, not an access check.
function isIdentified(m: Monster): boolean {
  return m.identifiedScansRequired > 0 && m.scanCount >= m.identifiedScansRequired
}

export function Bestiary() {
  const monsters = useQuery(api.monsters.listAll)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (monsters === undefined) return null

  const selected = monsters.find((m) => m.monsterId === selectedId) ?? null

  if (!selected) {
    return <BestiaryList monsters={monsters} onSelect={setSelectedId} />
  }
  return <StatCard monster={selected} onExit={() => setSelectedId(null)} />
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

const STAT_KEYS = ['rc', 'cc', 'ap', 'mv', 'def', 'hp'] as const

function StatCard({ monster, onExit }: { monster: Monster; onExit: () => void }) {
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
              <LoadoutBody loadout={loadouts[0]} />
            </div>
          ) : (
            loadouts.map((l, i) => (
              <details key={i} className="panel p-3" open={i === 0}>
                <summary className="cursor-pointer font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
                  {l.name || `Loadout ${i + 1}`}
                </summary>
                <div className="mt-2">
                  <LoadoutBody loadout={l} />
                </div>
              </details>
            ))
          )}

          {hasAbilities && (
            <div className="panel space-y-2 p-3">
              <div className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">Abilities</div>
              <ul className="space-y-1.5">
                {monster.abilities!.map((a, i) => (
                  <li key={i} className="font-body text-sm text-bone-dim">
                    <span className="font-mono font-semibold text-phosphor">{a.name}</span>
                    {a.description && <span> — {a.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

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

function LoadoutBody({ loadout }: { loadout: Loadout }) {
  const hasWeapons = loadout.weapons.ranged.length > 0 || loadout.weapons.melee.length > 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-1 text-center">
        {STAT_KEYS.map((k) => (
          <div key={k}>
            <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">{k}</div>
            <div className="text-glow font-display text-lg text-phosphor">{loadout.stats[k]}</div>
          </div>
        ))}
      </div>
      {hasWeapons && (
        <div className="space-y-3">
          {loadout.weapons.ranged.length > 0 && <WeaponTable label="Ranged" weapons={loadout.weapons.ranged} />}
          {loadout.weapons.melee.length > 0 && <WeaponTable label="Melee" weapons={loadout.weapons.melee} />}
        </div>
      )}
    </div>
  )
}

function WeaponTable({ label, weapons }: { label: string; weapons: Weapon[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 font-mono text-[10px] tracking-widest text-bone-dim uppercase">{label}</div>
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-[10px] tracking-widest text-phosphor-dim uppercase">
            <th className="w-0 py-1 pr-3 text-left font-medium whitespace-nowrap">Weapon</th>
            <th className="w-0 px-1.5 py-1 text-right font-medium">Atk</th>
            <th className="w-0 px-1.5 py-1 text-right font-medium">Dmg</th>
            <th className="py-1 pl-3 text-left font-medium">WR</th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((w, i) => (
            <tr key={i} className="border-t border-phosphor-faint align-top">
              <td className="py-1 pr-3 whitespace-nowrap text-bone">{w.name}</td>
              <td className="px-1.5 py-1 text-right text-phosphor">{w.atk}</td>
              <td className="px-1.5 py-1 text-right text-phosphor">{w.dmg}</td>
              <td className="py-1 pl-3 text-left text-bone-dim">{w.wr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
