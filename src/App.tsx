import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Autopsy } from './components/Autopsy'
import { Codex } from './components/Codex'
import { Cogitator } from './components/Cogitator'
import { Peril } from './components/Peril'
import { PlayerProfile } from './components/PlayerProfile'
import { StyleGuide } from './components/StyleGuide'
import { TabBar } from './components/TabBar'
import { VideoLink } from './components/VideoLink'
import { initials, PORTRAITS } from './lib/portraits'

// The campaign's pre-launch teaser trailer (from the Webflow teaser site),
// shown behind a click on the Lobby splash — see HeroSplash.
const CAMPAIGN_TRAILER_ID = 'xDjncwOnUH0'

type Identity = { sessionId: Id<'sessions'>; playerId: Id<'players'> }

const STORAGE_KEY = 'doomtroopers.identity'

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Identity) : null
  } catch {
    return null
  }
}

function saveIdentity(identity: Identity | null) {
  try {
    if (identity) localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable — session just won't survive a refresh.
  }
}

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity)

  function handleJoined(next: Identity) {
    saveIdentity(next)
    setIdentity(next)
  }

  function handleLeave() {
    saveIdentity(null)
    setIdentity(null)
  }

  // Dev/design reference, not a player-facing feature — reached directly by
  // URL (#styleguide), bypassing the join flow entirely, so it needs no
  // routing library or hosting rewrite rules (a hash never reaches the
  // server, so Vercel's static index.html serves it exactly like the root).
  if (window.location.hash === '#styleguide') {
    return (
      <div className="min-h-svh bg-ink text-bone">
        <StyleGuide />
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-ink text-bone">
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4 py-6">
        {identity ? (
          <SessionShell identity={identity} onLeave={handleLeave} />
        ) : (
          <Lobby onJoined={handleJoined} />
        )}
      </div>
    </div>
  )
}

// Full-bleed teaser lockup ported from the campaign's pre-launch Webflow
// site — negative margins cancel the App shell's own px-4/py-6 padding so
// the art reaches the edges of the max-w-md column, matching that site's
// cinematic hero rather than sitting boxed-in like the rest of the UI.
function HeroSplash() {
  return (
    <div className="-mx-4 -mt-6 space-y-3 border-b border-phosphor-faint bg-ink pb-4">
      <img
        src="/hero/doomtroopers-logo.webp"
        alt="Doomtroopers"
        className="mx-auto w-4/5 max-w-xs pt-6"
      />
      <img
        src="/hero/team-lineup.webp"
        alt="The Doomtroopers operatives, assembled"
        className="mx-auto block max-h-56 w-auto object-contain"
      />
      <div className="px-4">
        <VideoLink videoId={CAMPAIGN_TRAILER_ID} label="Campaign Trailer" />
      </div>
    </div>
  )
}

function Lobby({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')

  return (
    <div className="space-y-6">
      <HeroSplash />

      <div className="text-center">
        <p className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim">++ COGITATOR LINK ++</p>
        <p className="mt-2 font-mono text-xs text-bone-dim">Start a session as GM, or join one with a code.</p>
      </div>

      <TabBar
        tabs={
          [
            { key: 'create', label: 'Start Session' },
            { key: 'join', label: 'Join Session' },
          ] as const
        }
        value={mode}
        onChange={setMode}
      />

      {mode === 'create' ? <CreateSessionForm onJoined={onJoined} /> : <JoinSessionForm onJoined={onJoined} />}
    </div>
  )
}

function fieldLabelClasses() {
  return 'block font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase'
}

function fieldInputClasses() {
  return 'panel mt-1 w-full px-3 py-2 font-mono text-sm text-bone outline-none focus:border-phosphor'
}

function primaryButtonClasses() {
  return 'w-full border border-phosphor bg-phosphor-faint py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase transition hover:bg-phosphor/20 disabled:cursor-not-allowed disabled:opacity-40'
}

function CharacterSelect({
  value,
  onChange,
}: {
  value: Id<'characters'> | ''
  onChange: (id: Id<'characters'>) => void
}) {
  const characters = useQuery(api.characters.list)
  const sorted = characters ? [...characters].sort((a, b) => a.name.localeCompare(b.name)) : []

  return (
    <label className={fieldLabelClasses()}>
      Your character
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Id<'characters'>)}
        disabled={!characters}
        className={fieldInputClasses()}
      >
        <option value="" disabled>
          {characters ? 'Select your character' : 'Loading…'}
        </option>
        {sorted.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
            {c.playerRealName ? ` (${c.playerRealName})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function CreateSessionForm({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [characterId, setCharacterId] = useState<Id<'characters'> | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const create = useMutation(api.sessions.create)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!characterId) return
    setBusy(true)
    setError(null)
    try {
      const { sessionId, playerId } = await create({ characterId })
      onJoined({ sessionId, playerId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <CharacterSelect value={characterId} onChange={setCharacterId} />
      {error && <p className="font-mono text-xs text-sanguine">{error}</p>}
      <button type="submit" disabled={busy || !characterId} className={primaryButtonClasses()}>
        {busy ? 'Creating…' : 'Create Session'}
      </button>
    </form>
  )
}

function JoinSessionForm({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [code, setCode] = useState('')
  const [characterId, setCharacterId] = useState<Id<'characters'> | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const join = useMutation(api.sessions.join)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !characterId) return
    setBusy(true)
    setError(null)
    try {
      const { sessionId, playerId } = await join({ code: code.trim(), characterId })
      onJoined({ sessionId, playerId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className={fieldLabelClasses()}>
        Session code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7QX9"
          className={`${fieldInputClasses()} tracking-[0.3em] uppercase`}
        />
      </label>
      <CharacterSelect value={characterId} onChange={setCharacterId} />
      {error && <p className="font-mono text-xs text-sanguine">{error}</p>}
      <button type="submit" disabled={busy || !code.trim() || !characterId} className={primaryButtonClasses()}>
        {busy ? 'Joining…' : 'Join Session'}
      </button>
    </form>
  )
}

type Feature = 'menu' | 'autopsy' | 'codex' | 'profile' | 'cogitator' | 'peril'
type Player = { _id: Id<'players'>; characterName: string; isGM: boolean }

function SessionShell({ identity, onLeave }: { identity: Identity; onLeave: () => void }) {
  const data = useQuery(api.sessions.get, { sessionId: identity.sessionId })
  const [feature, setFeature] = useState<Feature>('menu')
  const [profileOpen, setProfileOpen] = useState(false)
  // Set only by a Stat Card's "View Autopsy Report" link, consumed once by
  // Codex on mount — every other way of navigating (main menu, the header
  // back button) clears it so a stale target can't resurface later.
  const [codexTarget, setCodexTarget] = useState<string | null>(null)

  function goToFeature(next: Feature) {
    setCodexTarget(null)
    setFeature(next)
  }

  if (data === undefined) {
    return <p className="text-center font-mono text-xs text-bone-dim">Loading session…</p>
  }
  if (data === null) {
    return (
      <div className="space-y-3 text-center">
        <p className="font-mono text-xs text-bone-dim">This session no longer exists.</p>
        <button onClick={onLeave} className="font-mono text-xs text-phosphor underline">
          Back to start
        </button>
      </div>
    )
  }

  const me = data.players.find((p) => p._id === identity.playerId)
  if (!me) {
    return <p className="text-center font-mono text-xs text-bone-dim">Your operator record isn't here anymore.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {feature === 'menu' ? (
          <span className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim uppercase">
            ++ Main Menu ++
          </span>
        ) : (
          <button
            type="button"
            onClick={() => goToFeature('menu')}
            className="border border-phosphor-dim px-2 py-1 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
          >
            ‹ Main Menu
          </button>
        )}
        <div className="flex items-center gap-2">
          <OperatorAvatarButton
            name={me.characterName}
            active={feature === 'profile'}
            onClick={() => goToFeature('profile')}
          />
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="border border-phosphor-dim px-2 py-1 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
          >
            {me.isGM && <span className="mr-1 text-brass">GM</span>}
            Session
          </button>
        </div>
      </div>

      {feature === 'menu' && (
        <MainMenu onSelect={goToFeature} showPeril={me.characterName === 'Vexilia Thornkell' || me.isGM} />
      )}
      {feature === 'autopsy' && (
        <Autopsy
          characterId={me.characterId}
          isGM={me.isGM}
          onViewCodexEntry={(slug) => {
            setCodexTarget(slug)
            setFeature('codex')
          }}
        />
      )}
      {feature === 'codex' && <Codex isGM={me.isGM} focusSlug={codexTarget} characterId={me.characterId} />}
      {feature === 'profile' && <PlayerProfile characterId={me.characterId} />}
      {feature === 'cogitator' && <Cogitator characterId={me.characterId} isGM={me.isGM} />}
      {feature === 'peril' && <Peril viewerCharacterId={me.characterId} isGM={me.isGM} />}

      {profileOpen && (
        <ProfileModal
          code={data.session.code}
          players={data.players}
          myPlayerId={identity.playerId}
          isGM={me.isGM}
          onClose={() => setProfileOpen(false)}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}

// Weighted deliberately, not a flat list of equally-sized rows: Autopsy and
// the Cogitator Scanner are the two things a player needs to find fastest
// each session, so they get matching oversized "primary objective" tiles up
// top. Codex is secondary reference material, one tier down. Operator,
// Inventory, and Stat Cards used to live here too, but each had a more
// natural home elsewhere — see OperatorAvatarButton (header), PlayerProfile
// (Inventory tab), and Autopsy's MonsterVisual (Stat Card on the specimen
// photo) — so the main menu itself only routes to things worth a dedicated
// screen of their own.
function MainMenu({
  onSelect,
  showPeril,
}: {
  onSelect: (feature: Feature) => void
  showPeril: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <PrimaryModuleTile
          glyph="Ψ"
          label="Autopsy"
          sublabel="Dissect Specimens"
          onClick={() => onSelect('autopsy')}
        />
        <PrimaryModuleTile
          glyph="▣"
          label="Scanner"
          sublabel="Cogitator Uplink"
          onClick={() => onSelect('cogitator')}
        />
      </div>

      <button
        type="button"
        onClick={() => onSelect('codex')}
        className="hud-corners panel flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-phosphor"
      >
        <span className="text-glow font-display text-2xl text-brass">⌘</span>
        <span className="flex-1">
          <span className="block font-mono text-sm font-medium tracking-widest text-bone uppercase">Codex</span>
          <span className="block font-mono text-[11px] text-bone-dim">Archive of unlocked lore.</span>
        </span>
        <span className="font-mono text-phosphor-dim">›</span>
      </button>

      {/* Only Vexilia herself (and the GM, for oversight) can trigger a Peril
          check — every other operator has no use for this screen. */}
      {showPeril && (
        <button
          type="button"
          onClick={() => onSelect('peril')}
          className="peril-scene peril-panel hud-corners flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
        >
          <span className="peril-warp-glow font-display text-2xl">Ѫ</span>
          <span className="flex-1">
            <span className="peril-warp-text block font-mono text-sm font-medium tracking-widest uppercase">
              Peril
            </span>
            <span className="block font-mono text-[11px] text-bone-dim">The warp strains against Vexilia's will.</span>
          </span>
          <span className="peril-warp-text-dim font-mono">›</span>
        </button>
      )}
    </div>
  )
}

function PrimaryModuleTile({
  glyph,
  label,
  sublabel,
  onClick,
}: {
  glyph: string
  label: string
  sublabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hud-corners panel-raised flex aspect-[4/5] flex-col items-center justify-center gap-2 px-2 py-4 text-center transition-colors hover:border-phosphor"
    >
      <span className="text-glow font-display text-5xl text-phosphor">{glyph}</span>
      <span className="text-glow font-display text-lg tracking-wide text-phosphor uppercase">{label}</span>
      <span className="font-mono text-[9px] tracking-[0.2em] text-phosphor-dim uppercase">{sublabel}</span>
    </button>
  )
}

// Stands in for the main menu's old "Operator Profile" row — a persistent
// header button, since it's the one screen (your own dossier) worth
// reaching from anywhere, not just the menu.
function OperatorAvatarButton({
  name,
  active,
  onClick,
}: {
  name: string
  active: boolean
  onClick: () => void
}) {
  const portrait = PORTRAITS[name]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Operator Profile"
      className={`h-7 w-7 shrink-0 overflow-hidden border transition-colors ${
        active ? 'border-phosphor' : 'border-phosphor-dim hover:border-phosphor'
      }`}
    >
      {portrait ? (
        <img src={portrait} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-panel-raised font-mono text-[9px] text-phosphor-dim">
          {initials(name)}
        </span>
      )}
    </button>
  )
}

function ProfileModal({
  code,
  players,
  myPlayerId,
  isGM,
  onClose,
  onLeave,
}: {
  code: string
  players: Player[]
  myPlayerId: Id<'players'>
  isGM: boolean
  onClose: () => void
  onLeave: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div className="panel-raised w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim uppercase">
            ++ Session Link ++
          </span>
          <button type="button" onClick={onClose} className="font-mono text-sm text-bone-dim hover:text-bone">
            ✕
          </button>
        </div>

        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim uppercase">Session code</p>
          <p className="text-glow font-display text-3xl font-semibold tracking-[0.3em] text-phosphor">{code}</p>
          {isGM && <p className="mt-1 font-mono text-[11px] text-bone-dim">Share this code with your players</p>}
        </div>

        <div className="mt-4">
          <h2 className="mb-2 font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
            Connected ({players.length})
          </h2>
          <ul className="panel divide-y divide-phosphor-faint">
            {players.map((p) => (
              <li key={p._id} className="flex items-center justify-between px-3 py-2 font-mono text-sm">
                <span>
                  {p.characterName} {p._id === myPlayerId && <span className="text-bone-dim">(you)</span>}
                </span>
                {p.isGM && (
                  <span className="border border-brass px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-brass uppercase">
                    GM
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onLeave}
          className="mt-4 w-full border border-sanguine py-2 text-center font-mono text-xs tracking-widest text-sanguine uppercase hover:bg-sanguine/10"
        >
          Leave Session
        </button>
      </div>
    </div>
  )
}
