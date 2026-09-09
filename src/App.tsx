import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { Codex } from './components/Codex'
import { LootBoard } from './components/LootBoard'
import { ScanMinigame } from './components/ScanMinigame'

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
    <div className="min-h-svh bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
        {identity ? (
          <SessionView identity={identity} onLeave={handleLeave} />
        ) : (
          <Lobby onJoined={handleJoined} />
        )}
      </div>
    </div>
  )
}

function Lobby({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Doomtroopers Companion</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Start a session as GM, or join one with a code.
        </p>
      </div>

      <div className="flex rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            mode === 'create'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          Start Session
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            mode === 'join'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          Join Session
        </button>
      </div>

      {mode === 'create' ? (
        <CreateSessionForm onJoined={onJoined} />
      ) : (
        <JoinSessionForm onJoined={onJoined} />
      )}
    </div>
  )
}

function CreateSessionForm({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const create = useMutation(api.sessions.create)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { sessionId, playerId } = await create({ gmName: name.trim() })
      onJoined({ sessionId, playerId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium">
        Your name (GM)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Julius"
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {busy ? 'Creating…' : 'Create Session'}
      </button>
    </form>
  )
}

function JoinSessionForm({ onJoined }: { onJoined: (identity: Identity) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const join = useMutation(api.sessions.join)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { sessionId, playerId } = await join({ code: code.trim(), name: name.trim() })
      onJoined({ sessionId, playerId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium">
        Session code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7QX9"
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <label className="block text-sm font-medium">
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ada"
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !code.trim() || !name.trim()}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white transition disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {busy ? 'Joining…' : 'Join Session'}
      </button>
    </form>
  )
}

function SessionView({ identity, onLeave }: { identity: Identity; onLeave: () => void }) {
  const data = useQuery(api.sessions.get, { sessionId: identity.sessionId })

  if (data === undefined) {
    return <p className="text-center text-sm text-neutral-500">Loading session…</p>
  }
  if (data === null) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-neutral-500">This session no longer exists.</p>
        <button onClick={onLeave} className="text-sm underline">
          Back to start
        </button>
      </div>
    )
  }

  const me = data.players.find((p) => p._id === identity.playerId)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Session code</p>
        <p className="font-mono text-4xl font-semibold tracking-[0.3em]">{data.session.code}</p>
        {me?.role === 'gm' && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Share this code with your players
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Connected ({data.players.length})
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {data.players.map((p) => (
            <li key={p._id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {p.name} {p._id === identity.playerId && <span className="text-neutral-400">(you)</span>}
              </span>
              {p.role === 'gm' && (
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
                  GM
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <SessionTabs sessionId={identity.sessionId} playerId={identity.playerId} isGM={me?.role === 'gm'} />

      <button onClick={onLeave} className="w-full text-center text-sm text-neutral-500 underline dark:text-neutral-400">
        Leave session
      </button>
    </div>
  )
}

function SessionTabs({
  sessionId,
  playerId,
  isGM,
}: {
  sessionId: Id<'sessions'>
  playerId: Id<'players'>
  isGM: boolean
}) {
  const [tab, setTab] = useState<'loot' | 'codex'>('loot')

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setTab('loot')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === 'loot'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          Loot
        </button>
        <button
          type="button"
          onClick={() => setTab('codex')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === 'codex'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          Codex
        </button>
      </div>

      {tab === 'loot' ? (
        <>
          <ScanMinigame sessionId={sessionId} />
          <LootBoard sessionId={sessionId} playerId={playerId} />
        </>
      ) : (
        <Codex isGM={isGM} />
      )}
    </div>
  )
}
