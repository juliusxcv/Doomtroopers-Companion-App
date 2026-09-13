// Cogitator Scanner scoring — ported from the old app's src/lib/scoring.ts,
// trimmed to just the one minigame this app has (the old file also covered
// three other minigames that don't exist here).

export interface RunResult {
  game: 'cogitators'
  /** stage reached when this run ended */
  level: number
  /** ms spent on this run */
  durationMs: number
  /** was this run a success? */
  success: boolean
  /** 0..1 blend of speed-vs-par and peak node control */
  efficiency: number
  /** count of nodes lost back to the enemy during the run */
  setbacks?: number
}

/**
 * Cogitator points awarded for a single cleared stage:
 *   base    = level * 5               (level progression)
 *   perf    = 0.4 + 1.2 * efficiency  (peak control + speed-vs-par, ~40%-160%)
 *   penalty = setbacks * 2            (lost nodes)
 * Failed runs award nothing.
 */
export function cogitatorRunPoints(run: RunResult): number {
  if (!run.success) return 0
  const base = run.level * 5
  const perf = 0.4 + 1.2 * Math.max(0, Math.min(1, run.efficiency))
  const penalty = (run.setbacks ?? 0) * 2
  return Math.max(1, Math.round(base * perf - penalty))
}
