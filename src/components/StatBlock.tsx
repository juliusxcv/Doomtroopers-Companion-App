// Shared stat-block UI pieces — the RC/CC/AP/MV/DEF/HP grid, Ranged/Melee
// weapon tables, and an abilities list — used by both the Bestiary's
// Monster Stat Cards and the player's own Operator Profile. Same shape,
// same "### Stats:"/"### Abilities:" vault convention on both sides (see
// scripts/sync-codex.mjs), just attached to a monster loadout on one side
// and directly to a character on the other.

// `inv` (Invulnerable save) is optional — most creatures/characters don't
// have one; it only shows as a 7th box when present.
export type Stats = { rc: string; cc: string; ap: string; mv: string; def: string; hp: string; inv?: string }
export type Weapon = { name: string; atk: string; dmg: string; wr: string }
export type Weapons = { ranged: Weapon[]; melee: Weapon[] }
export type Ability = { name: string; description: string }

const STAT_KEYS = ['rc', 'cc', 'ap', 'mv', 'def', 'hp'] as const

export function StatGrid({ stats }: { stats: Stats }) {
  const keys = stats.inv ? [...STAT_KEYS, 'inv' as const] : STAT_KEYS
  return (
    <div className={`grid gap-1 text-center ${stats.inv ? 'grid-cols-7' : 'grid-cols-6'}`}>
      {keys.map((k) => (
        <div key={k}>
          <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">{k}</div>
          <div className="text-glow font-display text-lg text-phosphor">{stats[k]}</div>
        </div>
      ))}
    </div>
  )
}

export function WeaponTable({ label, weapons }: { label: string; weapons: Weapon[] }) {
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

export function StatsAndWeapons({ stats, weapons }: { stats: Stats; weapons: Weapons }) {
  const hasWeapons = weapons.ranged.length > 0 || weapons.melee.length > 0
  return (
    <div className="space-y-3">
      <StatGrid stats={stats} />
      {hasWeapons && (
        <div className="space-y-3">
          {weapons.ranged.length > 0 && <WeaponTable label="Ranged" weapons={weapons.ranged} />}
          {weapons.melee.length > 0 && <WeaponTable label="Melee" weapons={weapons.melee} />}
        </div>
      )}
    </div>
  )
}

export function AbilitiesList({ abilities }: { abilities: Ability[] }) {
  return (
    <div className="panel space-y-2 p-3">
      <div className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">Abilities</div>
      <ul className="space-y-1.5">
        {abilities.map((a, i) => (
          <li key={i} className="font-body text-sm text-bone-dim">
            <span className="font-mono font-semibold text-phosphor">{a.name}</span>
            {a.description && <span> — {a.description}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
