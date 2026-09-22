// Shared stat-block UI pieces — the RC/CC/AP/MV/DEF/HP grid, Ranged/Melee
// weapon tables, and an abilities list — used by both the Bestiary's
// Monster Stat Cards and the player's own Operator Profile. Same shape,
// same "### Stats:"/"### Abilities:" vault convention on both sides (see
// scripts/sync-codex.mjs), just attached to a monster loadout on one side
// and directly to a character on the other.

import { ABILITY_ICONS } from '../lib/abilityIcons'

// `inv` (Invulnerable save) is optional — most creatures/characters don't
// have one; it only shows as a 7th box when present.
export type Stats = { rc: string; cc: string; ap: string; mv: string; def: string; hp: string; inv?: string }
export type Weapon = { name: string; atk: string; dmg: string; wr: string }
export type Weapons = { ranged: Weapon[]; melee: Weapon[] }
export type Ability = { name: string; description: string }

const STAT_KEYS = ['rc', 'cc', 'ap', 'mv', 'def', 'hp'] as const

export type StatKey = (typeof STAT_KEYS)[number] | 'inv'
// Player-applied +/- on top of the base stats (see convex/statMods.ts).
export type StatMods = Partial<Record<StatKey, number>>

// For RC/CC/DEF the number is a target roll ("3+"), so smaller is better;
// every other stat is better the bigger it gets.
const LOWER_IS_BETTER: Record<StatKey, boolean> = {
  rc: true,
  cc: true,
  def: true,
  ap: false,
  mv: false,
  hp: false,
  inv: false,
}
// Mirrors STAT_FLOOR in convex/statMods.ts, which enforces it server-side.
const STAT_FLOOR: Record<StatKey, number> = { rc: 1, cc: 1, def: 1, ap: 0, mv: 0, hp: 0, inv: 0 }

// "3+" → 3 / "+", `6"` → 6 / `"`. Non-numeric values ("--") can't be adjusted.
function parseStat(value: string) {
  const m = /^(\d+)(\D*)$/.exec(value.trim())
  return m ? { n: Number(m[1]), suffix: m[2] } : null
}

const TONE_CLASS = {
  base: 'text-glow text-phosphor',
  better: 'text-glow-blue text-rarity-rare',
  worse: 'text-glow-red text-sanguine',
} as const

// Bestiary cards pass only `stats`; the Operator Profile also passes `mods`
// (colours numbers blue/red by how the adjustment changes them), `onAdjust`
// (shows +/- controls under each adjustable number), and — for characters
// with a start-of-turn stance pick (see src/lib/stances.ts) — `stanceMods`.
// A stance-affected number keeps the same blue/red-for-better/worse colour
// as a manual edit (they can both land on the same stat) and additionally
// gets a gold outline, so the outline answers "is this temporary?" while
// the fill colour still answers "better or worse?".
export function StatGrid({
  stats,
  mods,
  stanceMods,
  onAdjust,
  large = false,
}: {
  stats: Stats
  mods?: StatMods
  stanceMods?: StatMods
  onAdjust?: (key: StatKey, delta: 1 | -1) => void
  large?: boolean
}) {
  const keys = stats.inv ? [...STAT_KEYS, 'inv' as const] : STAT_KEYS
  return (
    <div className={`grid gap-1 text-center ${stats.inv ? 'grid-cols-7' : 'grid-cols-6'}`}>
      {keys.map((k) => {
        const raw = stats[k] ?? ''
        const parsed = parseStat(raw)
        const modDelta = parsed ? (mods?.[k] ?? 0) : 0
        const stanceDelta = parsed ? (stanceMods?.[k] ?? 0) : 0
        const delta = modDelta + stanceDelta
        const shown = parsed ? `${parsed.n + delta}${parsed.suffix}` : raw
        const tone = delta === 0 ? 'base' : delta > 0 !== LOWER_IS_BETTER[k] ? 'better' : 'worse'
        const canDown = !!parsed && parsed.n + delta - 1 >= STAT_FLOOR[k]
        return (
          <div key={k} className="flex flex-col items-center">
            <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">{k}</div>
            {onAdjust && (
              <StepButton label={`Increase ${k}`} disabled={!parsed} onClick={() => onAdjust(k, 1)}>
                +
              </StepButton>
            )}
            <div
              className={`font-display ${large ? 'py-0.5 text-2xl' : 'text-lg'} ${TONE_CLASS[tone]} ${
                stanceDelta !== 0 ? 'text-outline-brass' : ''
              }`}
            >
              {shown}
            </div>
            {onAdjust && (
              <StepButton label={`Decrease ${k}`} disabled={!canDown} onClick={() => onAdjust(k, -1)}>
                −
              </StepButton>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-full border border-phosphor-dim py-1 font-mono text-sm leading-none text-bone transition-colors hover:border-phosphor disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
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

export function StatsAndWeapons({
  stats,
  weapons,
  mods,
  stanceMods,
  onAdjust,
  large,
}: {
  stats: Stats
  weapons: Weapons
  mods?: StatMods
  stanceMods?: StatMods
  onAdjust?: (key: StatKey, delta: 1 | -1) => void
  large?: boolean
}) {
  const hasWeapons = weapons.ranged.length > 0 || weapons.melee.length > 0
  return (
    <div className="space-y-3">
      <StatGrid stats={stats} mods={mods} stanceMods={stanceMods} onAdjust={onAdjust} large={large} />
      {hasWeapons && (
        <div className="space-y-3">
          {weapons.ranged.length > 0 && <WeaponTable label="Ranged" weapons={weapons.ranged} />}
          {weapons.melee.length > 0 && <WeaponTable label="Melee" weapons={weapons.melee} />}
        </div>
      )}
    </div>
  )
}

// Looked up by exact ability name (see src/lib/abilityIcons.ts); falls back
// to a generic rune glyph until real per-ability art is handed over, so the
// icon slot is already in place everywhere abilities render. `frame=false`
// drops its own border/background for use inside a larger slot that already
// draws one (see PlayerProfile.tsx's AbilitySlot).
export function AbilityIcon({
  name,
  className = 'h-8 w-8',
  frame = true,
}: {
  name: string
  className?: string
  frame?: boolean
}) {
  const src = ABILITY_ICONS[name]
  const contentSize = frame ? 'h-3/5 w-3/5' : 'h-full w-full'
  const content = src ? (
    <img src={src} alt="" className={`${contentSize} object-contain`} />
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className={`${contentSize} text-phosphor-dim`}
      aria-hidden="true"
    >
      <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
  if (!frame) return <div className={`flex items-center justify-center ${className}`}>{content}</div>
  return (
    <div className={`flex shrink-0 items-center justify-center border border-phosphor-dim bg-panel-raised ${className}`}>
      {content}
    </div>
  )
}

export function AbilitiesList({ abilities, showTitle = true }: { abilities: Ability[]; showTitle?: boolean }) {
  return (
    <div className="panel space-y-2 p-3">
      {showTitle && <div className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">Abilities</div>}
      <ul className="space-y-2.5">
        {abilities.map((a, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <AbilityIcon name={a.name} />
            <span className="font-body text-sm text-bone-dim">
              <span className="font-mono font-semibold text-phosphor">{a.name}</span>
              {a.description && <span> — {a.description}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
