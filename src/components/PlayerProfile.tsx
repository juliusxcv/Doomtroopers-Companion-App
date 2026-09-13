import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { AbilitiesList, StatsAndWeapons } from './StatBlock'

// Ported from the old app's player-avatars backup — static files, not
// vault-sourced, same call as src/components/Autopsy.tsx's CREATURE_IMAGES
// (binary assets stay out of the vault-sync pipeline). Keyed by exact
// roster name; a character with no portrait on file falls back to initials,
// matching the old app's own fallback behavior.
const PORTRAITS: Record<string, string> = {
  'Vexilia Thornkell': '/characters/vex.jpg',
  'Helbrecht Nullis': '/characters/nullis.jpg',
  'Isabella Alderidge': '/characters/isabella.jpg',
  'Gideon Rook': '/characters/gideon_rook.jpg',
  'ALB-XXIII': '/characters/albxxiii.jpg',
  Slabs: '/characters/slabs.jpg',
}

function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function PlayerProfile({ characterId }: { characterId: Id<'characters'> }) {
  const profile = useQuery(api.characters.getProfile, { characterId })

  if (profile === undefined) return null
  if (profile === null) {
    return (
      <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
        Operator record not found
      </p>
    )
  }

  const portrait = PORTRAITS[profile.name]
  const hasWeapons = profile.weapons && (profile.weapons.ranged.length > 0 || profile.weapons.melee.length > 0)
  const hasAbilities = profile.abilities && profile.abilities.length > 0
  const hasCard = profile.stats || hasWeapons || hasAbilities

  return (
    <div className="space-y-3">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ Operator Profile ++
      </h2>

      <div className="panel overflow-hidden">
        {portrait ? (
          <img src={portrait} alt={profile.name} className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-panel-raised">
            <span className="text-glow font-display text-6xl text-phosphor-dim">{initials(profile.name)}</span>
          </div>
        )}
      </div>

      <div className="text-center">
        <h3 className="text-glow font-display text-2xl text-phosphor">{profile.name}</h3>
        {profile.playerRealName && (
          <p className="font-mono text-xs text-bone-dim">{profile.playerRealName}</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {[
          { label: 'Autopsies', value: profile.autopsiesCompleted },
          { label: 'Recovered', value: profile.itemsRecovered },
          { label: 'Scrap', value: profile.scrap },
          { label: 'Components', value: profile.components },
        ].map(({ label, value }) => (
          <div key={label} className="panel py-1.5 text-center">
            <div className="font-mono text-[8px] tracking-widest text-phosphor-dim uppercase">{label}</div>
            <div className="text-glow font-display text-lg leading-none text-phosphor">{value}</div>
          </div>
        ))}
      </div>

      {profile.stats && (
        <div className="panel p-3">
          <StatsAndWeapons stats={profile.stats} weapons={profile.weapons ?? { ranged: [], melee: [] }} />
        </div>
      )}

      {hasAbilities && <AbilitiesList abilities={profile.abilities!} />}

      {!hasCard && (
        <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ No stat data catalogued ◊
        </p>
      )}
    </div>
  )
}
