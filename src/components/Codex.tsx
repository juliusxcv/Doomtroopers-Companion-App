import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

// listForGM/listForPlayers add computed tier-progress fields not stored on
// the document itself — see convex/codex.ts.
type CodexEntry = Doc<'codex_entries'> & { tierCount?: number; unlockedTierCount?: number }

type TreeNode = {
  name: string
  children: Map<string, TreeNode>
  entries: CodexEntry[]
}

function buildTree(entries: CodexEntry[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map(), entries: [] }
  for (const entry of entries) {
    let node = root
    for (const segment of entry.categoryPath) {
      let child = node.children.get(segment)
      if (!child) {
        child = { name: segment, children: new Map(), entries: [] }
        node.children.set(segment, child)
      }
      node = child
    }
    node.entries.push(entry)
  }
  return root
}

// `focusSlug` jumps straight to one entry (e.g. a Stat Card's "View Autopsy
// Report" link) instead of the full tree — captured into local state once
// at mount so a later click on "‹ Full Codex" can clear it without fighting
// a prop that never changes on its own (Codex remounts fresh every time the
// user navigates back into it, so there's no stale-focus risk).
export function Codex({
  isGM,
  focusSlug,
  characterId,
}: {
  isGM: boolean
  focusSlug?: string | null
  characterId: Id<'characters'>
}) {
  const gmEntries = useQuery(api.codex.listForGM, isGM ? {} : 'skip')
  const playerEntries = useQuery(api.codex.listForPlayers, isGM ? 'skip' : {})
  const entries = isGM ? gmEntries : playerEntries
  const balance = useQuery(api.cogitatorPoints.getBalance)
  const [focused, setFocused] = useState(focusSlug ?? null)

  if (entries === undefined) return null

  const focusedEntry = focused ? entries.find((e) => e.slug === focused) : undefined
  if (focusedEntry) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setFocused(null)}
          className="border border-phosphor-dim px-2 py-1 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
        >
          ‹ Full Codex
        </button>
        <div className="panel p-2">
          <EntryRow entry={focusedEntry} isGM={isGM} characterId={characterId} forceOpen />
        </div>
      </div>
    )
  }

  const tree = buildTree(entries)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
          ++ Codex Archive ++
        </h2>
        <span className="font-mono text-[11px] tracking-widest text-bone-dim">
          <span className="text-phosphor-dim">MAINFRAME POOL </span>
          <span className="text-glow text-phosphor">{balance ?? '—'} PTS</span>
        </span>
      </div>
      <CodeRedeemer />
      <div className="panel p-2">
        <TreeView node={tree} depth={0} isGM={isGM} characterId={characterId} />
      </div>
    </div>
  )
}

function CodeRedeemer() {
  const redeemCode = useMutation(api.codex.redeemCode)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    try {
      const result = await redeemCode({ code: code.trim() })
      if (result.status === 'unlocked') setMessage(`Unlocked: ${result.title}`)
      else if (result.status === 'already-unlocked') setMessage(`Already unlocked: ${result.title}`)
      else setMessage('No matching code.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setMessage(null)
          }}
          placeholder="Enter access code"
          className="panel min-w-0 flex-1 px-3 py-2 font-mono text-sm tracking-widest text-bone uppercase outline-none focus:border-phosphor"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 border border-phosphor bg-phosphor-faint px-3 py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase transition hover:bg-phosphor/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Redeem
        </button>
      </div>
      {message && <p className="font-mono text-xs text-bone-dim">{message}</p>}
    </form>
  )
}

function TreeView({
  node,
  depth,
  isGM,
  characterId,
}: {
  node: TreeNode
  depth: number
  isGM: boolean
  characterId: Id<'characters'>
}) {
  const folders = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b))
  const entries = [...node.entries].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-phosphor-faint pl-3' : ''}>
      {folders.map(([name, child]) => (
        <details key={name} open={depth < 1}>
          <summary className="cursor-pointer py-1 font-mono text-xs font-medium tracking-widest text-phosphor-dim uppercase">
            {name}
          </summary>
          <TreeView node={child} depth={depth + 1} isGM={isGM} characterId={characterId} />
        </details>
      ))}
      {entries.map((entry) => (
        <EntryRow key={entry._id} entry={entry} isGM={isGM} characterId={characterId} />
      ))}
    </div>
  )
}

function EntryRow({
  entry,
  isGM,
  characterId,
  forceOpen,
}: {
  entry: CodexEntry
  isGM: boolean
  characterId: Id<'characters'>
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(forceOpen ?? false)
  const setUnlocked = useMutation(api.codex.setUnlocked)
  const spendAndUnlock = useMutation(api.cogitatorPoints.spendAndUnlockMainframe)
  const balance = useQuery(api.cogitatorPoints.getBalance, entry.cost !== undefined && !isGM ? {} : 'skip')
  const [spendError, setSpendError] = useState<string | null>(null)
  const [spending, setSpending] = useState(false)
  const isTiered = entry.tiers !== undefined
  // `cost` is set only on Mainframe notes by the sync script's own
  // convention — a robust discriminator without checking categoryPath.
  const isMainframe = entry.cost !== undefined && !isTiered

  async function handleSpend() {
    setSpending(true)
    setSpendError(null)
    try {
      await spendAndUnlock({ characterId, entryId: entry._id })
    } catch (err) {
      setSpendError(err instanceof Error ? err.message : 'Unlock failed.')
    } finally {
      setSpending(false)
    }
  }

  return (
    <div className="py-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!isGM && !entry.unlocked}
          className={`flex-1 truncate text-left font-body ${entry.unlocked ? 'text-bone' : 'text-bone-dim/60'}`}
        >
          {!entry.unlocked && <span className="mr-1">🔒</span>}
          {entry.title}
        </button>
        {isTiered ? (
          <span className="shrink-0 font-mono text-[10px] tracking-widest text-phosphor-dim uppercase">
            {entry.unlockedTierCount}/{entry.tierCount} tiers
          </span>
        ) : isGM ? (
          <button
            type="button"
            onClick={() => setUnlocked({ entryId: entry._id, unlocked: !entry.unlocked })}
            className="shrink-0 border border-phosphor-dim px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest text-bone uppercase hover:border-phosphor"
          >
            {entry.unlocked ? 'Lock' : 'Unlock'}
          </button>
        ) : (
          isMainframe &&
          !entry.unlocked && (
            <button
              type="button"
              onClick={handleSpend}
              disabled={spending || (balance ?? 0) < (entry.cost ?? 0)}
              className={`shrink-0 border px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest uppercase disabled:cursor-not-allowed ${
                (balance ?? 0) < (entry.cost ?? 0)
                  ? 'border-sanguine/60 text-sanguine'
                  : 'border-phosphor-dim text-bone hover:border-phosphor'
              }`}
            >
              {spending ? 'Decrypting…' : `Unlock · ${entry.cost} pts`}
            </button>
          )
        )}
      </div>
      {spendError && <p className="mt-1 font-mono text-[10px] tracking-widest text-sanguine">◊ {spendError}</p>}

      {open && (entry.unlocked || isGM) && (
        <div className="mt-1 panel-raised p-3">
          {entry.code && (
            <p className="text-glow mb-2 font-mono text-base font-semibold tracking-wide text-phosphor">
              {entry.code}
            </p>
          )}
          {isTiered ? (
            entry.tiers && entry.tiers.length > 0 ? (
              <div className="prose-lore space-y-4">
                {entry.tiers.map((tier, i) => (
                  <Markdown key={i}>{tier.body}</Markdown>
                ))}
              </div>
            ) : (
              <p className="font-mono text-xs text-bone-dim">Not yet unlocked — needs more successful scans.</p>
            )
          ) : entry.body ? (
            <div className="prose-lore">
              <Markdown>{entry.body}</Markdown>
            </div>
          ) : (
            <p className="font-mono text-xs text-bone-dim">No further details.</p>
          )}
        </div>
      )}
    </div>
  )
}
