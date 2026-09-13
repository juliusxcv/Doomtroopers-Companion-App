import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { CogitatorScanner, type Difficulty } from './CogitatorScanner'

// Main-menu feature wrapper for the Cogitator Scanner minigame — same shape
// as Autopsy.tsx/Bestiary.tsx. Shows the shared party points pool (also
// visible from Codex.tsx while browsing Mainframe entries) and mounts the
// game itself, keyed by difficulty+run so choosing a new difficulty or
// restarting starts a completely fresh run.
export function Cogitator({ characterId, isGM }: { characterId: Id<'characters'>; isGM: boolean }) {
  const balance = useQuery(api.cogitatorPoints.getBalance)
  const [difficulty, setDifficulty] = useState<Difficulty>('acolyte')
  const [runKey, setRunKey] = useState(0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
          ++ Cogitator Scanner ++
        </h2>
        <span className="font-mono text-[11px] tracking-widest text-bone-dim">
          <span className="text-phosphor-dim">POOL </span>
          <span className="text-glow text-phosphor">{balance ?? '—'} PTS</span>
        </span>
      </div>

      {isGM && (
        <p className="panel px-3 py-2 text-center font-mono text-[11px] tracking-widest text-bone-dim uppercase">
          ◊ GM run — party points are not awarded ◊
        </p>
      )}

      <CogitatorScanner
        key={runKey}
        difficulty={difficulty}
        characterId={characterId}
        isGM={isGM}
        // [esc] resets all the way back to this feature's default starting
        // state (Lvl-I, stage 1) — the ↺ button next to it just retries the
        // current difficulty. Leaving the feature entirely is the global
        // "‹ Main Menu" header button every feature already relies on.
        onExit={() => {
          setDifficulty('acolyte')
          setRunKey((k) => k + 1)
        }}
        onRestart={() => setRunKey((k) => k + 1)}
        onChangeDifficulty={(d) => {
          setDifficulty(d)
          setRunKey((k) => k + 1)
        }}
      />
    </div>
  )
}
