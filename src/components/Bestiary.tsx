import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

type Monster = Doc<'monsters'>
type Weapon = { name: string; atk: string; dmg: string; wr: string }

// Name stays gated behind identification, matching the Autopsy/Codex
// convention — but stats/weapons/abilities are shown regardless, since
// players need combat info before they've had a chance to dissect anything.
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
  const displayName = isIdentified(monster) ? monster.name : monster.code
  const hasWeapons = monster.weapons && (monster.weapons.ranged.length > 0 || monster.weapons.melee.length > 0)
  const hasAbilities = monster.abilities && monster.abilities.length > 0
  const hasCard = monster.stats || hasWeapons || hasAbilities

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="font-mono text-xs tracking-widest text-phosphor-dim uppercase">{monster.code}</p>
        <h2 className="text-glow font-display text-2xl text-phosphor">{displayName}</h2>
      </div>

      {monster.blurb && <p className="text-center font-body text-sm text-bone-dim italic">"{monster.blurb}"</p>}

      {monster.stats && (
        <div className="panel p-3">
          <div className="mb-2 font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">Stats</div>
          <div className="grid grid-cols-6 gap-1 text-center">
            {STAT_KEYS.map((k) => (
              <div key={k}>
                <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">{k}</div>
                <div className="text-glow font-display text-lg text-phosphor">{monster.stats![k]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasWeapons && (
        <div className="panel space-y-3 p-3">
          <div className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">Weapons</div>
          {monster.weapons!.ranged.length > 0 && <WeaponTable label="Ranged" weapons={monster.weapons!.ranged} />}
          {monster.weapons!.melee.length > 0 && <WeaponTable label="Melee" weapons={monster.weapons!.melee} />}
        </div>
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

function WeaponTable({ label, weapons }: { label: string; weapons: Weapon[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 font-mono text-[10px] tracking-widest text-bone-dim uppercase">{label}</div>
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-[10px] tracking-widest text-phosphor-dim uppercase">
            <th className="py-1 text-left font-medium">Weapon</th>
            <th className="py-1 text-right font-medium">Atk</th>
            <th className="py-1 text-right font-medium">Dmg</th>
            <th className="py-1 text-right font-medium">WR</th>
          </tr>
        </thead>
        <tbody>
          {weapons.map((w, i) => (
            <tr key={i} className="border-t border-phosphor-faint">
              <td className="py-1 text-bone">{w.name}</td>
              <td className="py-1 text-right text-phosphor">{w.atk}</td>
              <td className="py-1 text-right text-phosphor">{w.dmg}</td>
              <td className="py-1 text-right text-bone-dim">{w.wr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
