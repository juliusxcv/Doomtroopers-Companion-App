import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Autopsy } from './components/Autopsy'
import { Codex } from './components/Codex'
import { Inventory } from './components/Inventory'

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

  return (
    <div className="min-h-svh bg-ink text-bone">
      <div className={`mx-auto flex min-h-svh w-full max-w-md flex-col px-4 py-6 ${identity ? '' : 'justify-center'}`}>
        {identity ? (
          <SessionShell identity={identity} onLeave={handleLeave} />
        ) : (
          <Lobby onJoined={handleJoined} />
        )}
      </div>
    </div>
  )
}

function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <div className="panel flex p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex-1 py-2 font-mono text-xs font-medium tracking-widest uppercase transition-colors ${
            value === t.key ? 'bg-phosphor-faint text-glow text-phosphor' : 'text-bone-dim hover:text-bone'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Lobby({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim">++ COGITATOR LINK ++</p>
        <h1 className="text-glow font-display text-3xl leading-tight text-phosphor">
          Doomtroopers Companion
        </h1>
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

type Feature = 'menu' | 'autopsy' | 'inventory' | 'codex'
type Player = { _id: Id<'players'>; characterName: string; isGM: boolean }

function SessionShell({ identity, onLeave }: { identity: Identity; onLeave: () => void }) {
  const data = useQuery(api.sessions.get, { sessionId: identity.sessionId })
  const [feature, setFeature] = useState<Feature>('menu')
  const [profileOpen, setProfileOpen] = useState(false)

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
      <div className="flex items-center justify-between">
        {feature === 'menu' ? (
          <span className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim uppercase">
            ++ Main Menu ++
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setFeature('menu')}
            className="border border-phosphor-dim px-2 py-1 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
          >
            ‹ Main Menu
          </button>
        )}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="border border-phosphor-dim px-2 py-1 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
        >
          {me.isGM && <span className="mr-1 text-brass">GM</span>}
          Session
        </button>
      </div>

      {feature === 'menu' && <MainMenu onSelect={setFeature} />}
      {feature === 'autopsy' && <Autopsy characterId={me.characterId} isGM={me.isGM} />}
      {feature === 'inventory' && <Inventory />}
      {feature === 'codex' && <Codex isGM={me.isGM} />}

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

function MainMenu({ onSelect }: { onSelect: (feature: Feature) => void }) {
  const items: { key: Feature; label: string; glyph: string; description: string }[] = [
    { key: 'autopsy', label: 'Autopsy', glyph: 'Ψ', description: 'Dissect specimens for loot and scan progress.' },
    { key: 'inventory', label: 'Inventory', glyph: '◈', description: 'Recovered relics, every operator.' },
    { key: 'codex', label: 'Codex', glyph: '⌘', description: 'Archive of unlocked lore.' },
  ]

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          className="panel flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:border-phosphor"
        >
          <span className="text-glow font-display text-3xl text-phosphor">{item.glyph}</span>
          <span className="flex-1">
            <span className="text-glow block font-display text-xl text-phosphor">{item.label}</span>
            <span className="block font-mono text-xs text-bone-dim">{item.description}</span>
          </span>
          <span className="font-mono text-phosphor-dim">›</span>
        </button>
      ))}
    </div>
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
