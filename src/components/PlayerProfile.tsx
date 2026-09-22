import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { RARITIES, RARITY_BORDER, RARITY_GLYPH, RARITY_TEXT, type Rarity } from '../lib/rarity'
import { ABILITY_ICONS } from '../lib/abilityIcons'
import { initials, PORTRAITS } from '../lib/portraits'
import { STANCES } from '../lib/stances'
import { AbilitiesList, AbilityIcon, StatsAndWeapons, type Ability, type StatKey, type StatMods } from './StatBlock'
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
type InventoryRow = Doc<'inventory'>

// One operator fills the screen at a time (their own by default — least taps
// for the thing you look at every session), with a portrait strip on top to
// jump to any other operator. Inventory is its own full view behind a button
// rather than a section, since a grid of relics needs the room.
export function PlayerProfile({ characterId, isGM }: { characterId: Id<'characters'>; isGM: boolean }) {
  const profiles = useQuery(api.characters.listProfiles)
  const [selectedId, setSelectedId] = useState<Id<'characters'>>(characterId)
  const [view, setView] = useState<'profile' | 'inventory'>('profile')

  if (profiles === undefined) return null

  const sorted = [...profiles].sort((a, b) => {
    if (a._id === characterId) return -1
    if (b._id === characterId) return 1
    return a.name.localeCompare(b.name)
  })
  const selected = sorted.find((p) => p._id === selectedId) ?? sorted[0]
  if (!selected) return null

  if (view === 'inventory') {
    return <InventoryView profile={selected} onBack={() => setView('profile')} />
  }

  return (
    <div className="space-y-4">
      <RosterStrip
        profiles={sorted}
        selectedId={selected._id}
        onSelect={(id) => {
          setSelectedId(id)
          setView('profile')
        }}
      />

      <ProfileHeader profile={selected} isMe={selected._id === characterId} />

      <StatsSection key={selected._id} profile={selected} canEdit={isGM || selected._id === characterId} />
      <section className="space-y-2">
        <SectionLabel>Abilities</SectionLabel>
        <AbilitiesSection profile={selected} canEditStance={isGM || selected._id === characterId} />
      </section>

      <InventoryButton profile={selected} onOpen={() => setView('inventory')} />

      {(selected.dossier || selected.videoId) && (
        <details className="panel">
          <summary className="cursor-pointer p-3 font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
            ◊ Dossier ◊
          </summary>
          <div className="space-y-3 border-t border-phosphor-faint p-3">
            {selected.videoId && <VideoLink videoId={selected.videoId} label="Dossier Trailer" />}
            {selected.dossier && (
              <div className="prose-lore">
                <Markdown>{selected.dossier}</Markdown>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
      ++ {children} ++
    </h2>
  )
}

function Portrait({ name, className }: { name: string; className: string }) {
  const portrait = PORTRAITS[name]
  return (
    <div className={`overflow-hidden bg-panel-raised ${className}`}>
      {portrait ? (
        <img src={portrait} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-glow font-display text-2xl text-phosphor-dim">{initials(name)}</span>
        </div>
      )}
    </div>
  )
}

function RosterStrip({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: Profile[]
  selectedId: Id<'characters'>
  onSelect: (id: Id<'characters'>) => void
}) {
  return (
    <div className="flex gap-1.5">
      {profiles.map((p) => {
        const active = p._id === selectedId
        return (
          <button
            key={p._id}
            type="button"
            onClick={() => onSelect(p._id)}
            aria-label={p.name}
            aria-pressed={active}
            className={`min-w-0 flex-1 border transition-opacity ${
              active ? 'border-phosphor' : 'border-phosphor-faint opacity-60 hover:opacity-100'
            }`}
          >
            <Portrait name={p.name} className="aspect-square w-full" />
          </button>
        )
      })}
    </div>
  )
}

function ProfileHeader({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  return (
    <div className="hud-corners panel-raised p-3">
      <div className="flex gap-3">
        {/* Stretches to the height of the text column beside it. */}
        <Portrait name={profile.name} className="min-h-28 w-28 shrink-0 self-stretch border border-phosphor-dim" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] uppercase">
            <span className="text-phosphor-dim">◊ Operator</span>
            {profile.isGM && <span className="border border-brass px-1 text-brass">GM</span>}
            {isMe && <span className="border border-brass px-1 text-brass">You</span>}
          </div>
          <span className="text-glow font-display text-xl leading-tight text-phosphor">{profile.name}</span>
          {profile.playerRealName && (
            <span className="truncate font-mono text-[11px] text-bone-dim">{profile.playerRealName}</span>
          )}

          {/* Compact list under the player name, same text size as it,
              with dotted leaders running out to the numbers. */}
          <dl className="mt-1 space-y-0.5 font-mono text-[11px] tracking-wide">
            {[
              { label: 'Autopsies', value: profile.autopsiesCompleted },
              { label: 'Recovered', value: profile.itemsRecovered },
              { label: 'Scrap', value: profile.scrap },
              { label: 'Components', value: profile.components },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-1.5 text-phosphor">
                <dt className="uppercase">{label}</dt>
                <span className="min-w-2 flex-1 border-b border-dotted border-phosphor-dim" aria-hidden="true" />
                <dd className="text-glow">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

// Numbers are green by default; a player-applied adjustment turns one blue
// (better than the base value) or red (worse) — which direction counts as
// "better" depends on the stat, see StatBlock.tsx. Edit mode reveals the +/-
// controls; only the operator themselves (or the GM) gets the Edit button.
function StatsSection({ profile, canEdit }: { profile: Profile; canEdit: boolean }) {
  const modRows = useQuery(api.statMods.forCharacter, { characterId: profile._id })
  const adjust = useMutation(api.statMods.adjust)
  const resetMods = useMutation(api.statMods.reset)
  const [editing, setEditing] = useState(false)

  // Only the operator's own stat block (unit "") can carry a stance choice —
  // see src/lib/stances.ts. Skipped entirely for characters without one, so
  // this doesn't fire an extra query for the other five roster members.
  const stanceConfig = STANCES[profile.name]
  const activeStanceChoice = useQuery(
    api.stances.getChoice,
    stanceConfig ? { characterId: profile._id } : 'skip',
  )
  const stanceDeltas = stanceConfig?.options.find((o) => o.name === activeStanceChoice)?.deltas

  const hasWeapons = profile.weapons && (profile.weapons.ranged.length > 0 || profile.weapons.melee.length > 0)
  const hasCompanions = profile.companions && profile.companions.length > 0
  const hasAnyStats = !!profile.stats || hasWeapons || hasCompanions

  const modsFor = (unit: string): StatMods => modRows?.find((r) => r.unit === unit)?.deltas ?? {}
  const hasMods = !!modRows?.some((r) => Object.values(r.deltas).some((d) => d))
  const adjusterFor = (unit: string) =>
    canEdit && editing
      ? (stat: StatKey, delta: 1 | -1) => void adjust({ characterId: profile._id, unit, stat, delta })
      : undefined

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Stats</SectionLabel>
        {canEdit && hasAnyStats && (
          <div className="flex gap-1.5">
            {editing && hasMods && (
              <button
                type="button"
                onClick={() => void resetMods({ characterId: profile._id })}
                className="border border-sanguine px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest text-sanguine uppercase hover:bg-sanguine/10"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className={`border px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest uppercase ${
                editing
                  ? 'border-phosphor bg-phosphor-faint text-phosphor'
                  : 'border-phosphor-dim text-bone hover:border-phosphor'
              }`}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
        )}
      </div>

      {!hasAnyStats ? (
        <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ No stat data catalogued ◊
        </p>
      ) : (
        <div className="space-y-3">
          {profile.stats && (
            <div className="panel-raised p-3">
              <StatsAndWeapons
                stats={profile.stats}
                weapons={profile.weapons ?? { ranged: [], melee: [] }}
                mods={modsFor('')}
                stanceMods={stanceDeltas}
                onAdjust={adjusterFor('')}
                large
              />
            </div>
          )}

          {hasCompanions &&
            profile.companions!.map((c, i) => (
              <div key={i} className="panel-raised p-3">
                <div className="mb-2 font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
                  ◊ Companion — {c.name}
                </div>
                <StatsAndWeapons
                  stats={c.stats}
                  weapons={c.weapons}
                  mods={modsFor(c.name)}
                  onAdjust={adjusterFor(c.name)}
                  large
                />
              </div>
            ))}
        </div>
      )}
    </section>
  )
}

function AbilitiesSection({ profile, canEditStance }: { profile: Profile; canEditStance: boolean }) {
  const hasAbilities = profile.abilities && profile.abilities.length > 0
  const companionsWithAbilities = (profile.companions ?? []).filter(
    (c): c is Companion & { abilities: NonNullable<Companion['abilities']> } =>
      !!c.abilities && c.abilities.length > 0,
  )

  if (!hasAbilities && companionsWithAbilities.length === 0) {
    return (
      <p className="panel py-6 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
        ◊ No abilities catalogued ◊
      </p>
    )
  }

  // For a character with a start-of-turn stance pick (ALB-XXIII, Gideon
  // Rook — see src/lib/stances.ts), the meta-ability and each of its named
  // options already appear as separate entries in `abilities`; the picker
  // below absorbs and interacts with them, so they're pulled out of the
  // plain read-only list to avoid showing the same text twice.
  const stanceConfig = STANCES[profile.name]
  const stanceNames = new Set(stanceConfig ? [stanceConfig.metaAbilityName, ...stanceConfig.options.map((o) => o.name)] : [])
  const plainAbilities = (profile.abilities ?? []).filter((a) => !stanceNames.has(a.name))

  return (
    <div className="space-y-3">
      {stanceConfig && profile.abilities && (
        <StancePicker
          characterId={profile._id}
          config={stanceConfig}
          abilities={profile.abilities}
          canEdit={canEditStance}
        />
      )}
      {plainAbilities.length > 0 && <AbilitiesList abilities={plainAbilities} showTitle={false} />}
      {companionsWithAbilities.map((c, i) => (
        <div key={i}>
          <div className="mb-1 font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
            ◊ Companion — {c.name}
          </div>
          <AbilitiesList abilities={c.abilities} showTitle={false} />
        </div>
      ))}
    </div>
  )
}

// Lets the player (or GM) pick which named stance is active this
// activation — ALB-XXIII's Doctrina Imperatives, Gideon Rook's Skill at
// Arms. Unlike stat-mod editing, there's no separate "Edit" toggle: this is
// meant to be tapped every turn, not a rare adjustment. The chosen option's
// numeric deltas (if any) flow into StatsSection's stanceMods above.
function StancePicker({
  characterId,
  config,
  abilities,
  canEdit,
}: {
  characterId: Id<'characters'>
  config: (typeof STANCES)[string]
  abilities: Ability[]
  canEdit: boolean
}) {
  const activeChoice = useQuery(api.stances.getChoice, { characterId })
  const setChoice = useMutation(api.stances.setChoice)
  const descByName = new Map(abilities.map((a) => [a.name, a.description]))
  const activeDescription = activeChoice ? descByName.get(activeChoice) : undefined

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center gap-2">
        <AbilityIcon name={config.metaAbilityName} className="h-6 w-6" />
        <div className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">
          {config.metaAbilityName}
        </div>
      </div>
      {descByName.get(config.metaAbilityName) && (
        <p className="font-body text-sm text-bone-dim">{descByName.get(config.metaAbilityName)}</p>
      )}
      <div className="flex gap-0">
        {config.options.map((opt) => (
          <AbilitySlot
            key={opt.name}
            name={opt.name}
            active={activeChoice === opt.name}
            disabled={!canEdit}
            onActivate={() => void setChoice({ characterId, choice: opt.name })}
          />
        ))}
      </div>
      {activeChoice && activeDescription && (
        <p className="border-t border-phosphor-faint pt-2 font-body text-sm text-bone-dim">
          <span className="font-mono font-semibold text-brass">{activeChoice}</span> — {activeDescription}
        </p>
      )}
    </div>
  )
}

// One slot in the start-of-turn ability bar — a game-UI "hotbar" icon that
// lights up brass when it's the active choice, and sits dim/desaturated
// otherwise, rather than a plain text pill. Works the same way regardless
// of whether the icon behind it ends up being placeholder art or the real
// hand-authored art, since the state treatment (dim vs. lit) lives on the
// slot frame, not on the image itself. Sized to the real art's own
// proportions (a tall card, not a square — see ART_ASPECT) so nothing gets
// letterboxed inside a mismatched box; `flex-1` packs all of a character's
// options edge-to-edge on one line rather than wrapping.
const ART_ASPECT = '745 / 854'

function AbilitySlot({
  name,
  active,
  disabled,
  onActivate,
}: {
  name: string
  active: boolean
  disabled: boolean
  onActivate: () => void
}) {
  // Real art (see src/lib/abilityIcons.ts) already carries its own ornate
  // border, so it gets dimmed/lit via CSS filter instead of the placeholder
  // glyph's border+background frame — see .ability-art-* in index.css.
  const hasArt = !!ABILITY_ICONS[name]
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onActivate}
      className="group flex min-w-0 flex-1 flex-col items-center gap-1 disabled:cursor-not-allowed"
    >
      <div
        style={{ aspectRatio: ART_ASPECT }}
        className={
          hasArt
            ? `w-full transition-all duration-150 ${active ? 'ability-slot-active ability-art-active' : 'ability-art-inactive'}`
            : `hud-corners flex w-full items-center justify-center border p-3 transition-all duration-150 ${
                active
                  ? 'ability-slot-active border-brass bg-brass/10'
                  : 'border-phosphor-faint bg-panel-raised opacity-50 grayscale group-enabled:group-hover:opacity-80 group-enabled:group-hover:grayscale-0'
              }`
        }
      >
        <AbilityIcon name={name} className="h-full w-full" frame={false} />
      </div>
      <span
        className={`truncate text-center font-mono text-[9px] leading-tight tracking-widest uppercase ${
          active ? 'text-brass' : 'text-bone-dim'
        }`}
      >
        {name}
      </span>
    </button>
  )
}

function BackpackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 5.5V5a3 3 0 0 1 6 0v.5" />
      <path d="M6 9a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 18 9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M9 21v-5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 16v5" />
      <path d="M6 12H4.5M18 12h1.5M9 10h6" />
    </svg>
  )
}

function InventoryButton({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  const rows = useQuery(api.inventory.listAll)
  const held = rows?.filter((r) => r.characterId === profile._id && !r.smelted).length

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hud-corners panel flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-phosphor"
    >
      <BackpackIcon className="h-9 w-9 shrink-0 text-brass" />
      <span className="flex-1">
        <span className="block font-mono text-sm font-medium tracking-widest text-bone uppercase">Inventory</span>
        <span className="block font-mono text-[11px] text-bone-dim">
          {held === undefined ? 'Opening the pack…' : `${held} item${held === 1 ? '' : 's'} carried`}
        </span>
      </span>
      <span className="font-mono text-phosphor-dim">›</span>
    </button>
  )
}

// Scoped down from the old app-wide Reliquary Manifest (retired) to just one
// operator's own recovered items, laid out as a grid of square tiles — tap
// one for its details and the smelt/restore action. Resource totals
// (scrap/components) already surface in the profile header, so no separate
// stockpile summary is repeated here.
function InventoryView({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const rows = useQuery(api.inventory.listAll)
  const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null)
  const [showSmelted, setShowSmelted] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  if (rows === undefined) return null

  const myRows = rows.filter((r) => r.characterId === profile._id)
  const smeltedCount = myRows.filter((r) => r.smelted).length
  const baseRows = showSmelted ? myRows : myRows.filter((r) => !r.smelted)
  const tally = baseRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.rarity] = (acc[r.rarity] ?? 0) + 1
    return acc
  }, {})
  const visibleRows = rarityFilter ? baseRows.filter((r) => r.rarity === rarityFilter) : baseRows
  const openRow = myRows.find((r) => r._id === openId) ?? null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border border-phosphor-dim px-2 py-1 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
        >
          ‹ Profile
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <BackpackIcon className="h-5 w-5 shrink-0 text-brass" />
          <span className="text-glow truncate font-display text-lg text-phosphor">{profile.name}</span>
        </div>
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
        <p className="panel py-8 text-center font-mono text-xs tracking-widest text-bone-dim uppercase">
          ◊ The pack is empty ◊
        </p>
      ) : (
        <ul className="grid grid-cols-4 gap-1.5">
          {visibleRows.map((row) => (
            <li key={row._id}>
              <ItemTile row={row} onOpen={() => setOpenId(row._id)} />
            </li>
          ))}
        </ul>
      )}

      {openRow && <ItemDetail row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function ItemTile({ row, onOpen }: { row: InventoryRow; onOpen: () => void }) {
  const border = row.smelted ? 'border-sanguine' : RARITY_BORDER[row.rarity]
  const text = row.smelted ? 'text-sanguine' : RARITY_TEXT[row.rarity]
  return (
    <button
      type="button"
      onClick={onOpen}
      title={row.itemName}
      className={`panel flex aspect-square w-full flex-col items-center justify-center gap-1 border p-1 text-center transition-colors hover:bg-panel-raised ${border} ${
        row.smelted ? 'opacity-60' : ''
      }`}
    >
      <span className={`text-2xl leading-none ${text}`}>{RARITY_GLYPH[row.rarity]}</span>
      <span className="line-clamp-2 w-full font-mono text-[9px] leading-tight break-words text-bone">
        {row.itemName}
      </span>
    </button>
  )
}

function ItemDetail({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const setSmelted = useMutation(api.inventory.setSmelted)
  const border = row.smelted ? 'border-sanguine' : RARITY_BORDER[row.rarity]
  const text = row.smelted ? 'text-sanguine' : RARITY_TEXT[row.rarity]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div className={`panel-raised w-full max-w-sm border p-4 ${border}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <span className={`text-4xl leading-none ${text}`}>{RARITY_GLYPH[row.rarity]}</span>
          <div className="min-w-0 flex-1">
            <div className={`font-display text-lg leading-tight ${text}`}>{row.itemName}</div>
            <div className={`font-mono text-[10px] tracking-widest uppercase ${text}`}>{row.rarity}</div>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-sm text-bone-dim hover:text-bone">
            ✕
          </button>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
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
          onClick={() => {
            setSmelted({ inventoryId: row._id, smelted: !row.smelted })
            onClose()
          }}
          className="mt-4 w-full border border-phosphor-dim py-1.5 font-mono text-xs font-medium tracking-widest text-bone uppercase hover:border-phosphor"
        >
          {row.smelted ? 'Restore Item' : 'Smelt Item'}
        </button>
      </div>
    </div>
  )
}
