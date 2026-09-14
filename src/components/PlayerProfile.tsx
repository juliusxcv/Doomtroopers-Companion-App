import { useQuery } from 'convex/react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
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
type SubTab = 'stats' | 'abilities' | 'lore'

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
              { key: 'lore', label: 'Lore' },
            ] as const
          }
          value={tab}
          onChange={setTab}
        />

        {tab === 'stats' && <StatsTab profile={profile} />}
        {tab === 'abilities' && <AbilitiesTab profile={profile} />}
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
