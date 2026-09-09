import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

type CodexEntry = Doc<'codex_entries'>

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

export function Codex({ isGM }: { isGM: boolean }) {
  const gmEntries = useQuery(api.codex.listForGM, isGM ? {} : 'skip')
  const playerEntries = useQuery(api.codex.listForPlayers, isGM ? 'skip' : {})
  const entries = isGM ? gmEntries : playerEntries

  if (entries === undefined) return null

  const tree = buildTree(entries)

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Codex</h2>
      <div className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
        <TreeView node={tree} depth={0} isGM={isGM} />
      </div>
    </div>
  )
}

function TreeView({ node, depth, isGM }: { node: TreeNode; depth: number; isGM: boolean }) {
  const folders = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b))
  const entries = [...node.entries].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-neutral-200 pl-3 dark:border-neutral-800' : ''}>
      {folders.map(([name, child]) => (
        <details key={name} open={depth < 1}>
          <summary className="cursor-pointer py-1 text-sm font-medium">{name}</summary>
          <TreeView node={child} depth={depth + 1} isGM={isGM} />
        </details>
      ))}
      {entries.map((entry) => (
        <EntryRow key={entry._id} entry={entry} isGM={isGM} />
      ))}
    </div>
  )
}

function EntryRow({ entry, isGM }: { entry: CodexEntry; isGM: boolean }) {
  const [open, setOpen] = useState(false)
  const setUnlocked = useMutation(api.codex.setUnlocked)

  return (
    <div className="py-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!isGM && !entry.unlocked}
          className="flex-1 truncate text-left disabled:text-neutral-400 dark:disabled:text-neutral-600"
        >
          {!entry.unlocked && <span className="mr-1">🔒</span>}
          {entry.title}
        </button>
        {isGM && (
          <button
            type="button"
            onClick={() => setUnlocked({ entryId: entry._id, unlocked: !entry.unlocked })}
            className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-medium dark:border-neutral-700"
          >
            {entry.unlocked ? 'Lock' : 'Unlock'}
          </button>
        )}
      </div>

      {open && (entry.unlocked || isGM) && (
        <div className="mt-1 rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
          {entry.code && (
            <p className="mb-2 font-mono text-base font-semibold tracking-wide">{entry.code}</p>
          )}
          {entry.body ? (
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <Markdown>{entry.body}</Markdown>
            </div>
          ) : (
            <p className="text-neutral-400">No further details.</p>
          )}
        </div>
      )}
    </div>
  )
}
