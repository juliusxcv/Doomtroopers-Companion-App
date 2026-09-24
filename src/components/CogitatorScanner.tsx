import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { cogitatorRunPoints, type RunResult } from '../lib/scoring'

// Faithful port of the old Lovable app's CogitatorScanner.tsx — a real-time
// canvas node-capture RTS. Simulation logic, constants, and level-generation
// formulas are ported verbatim; only the Convex integration point (award on
// stage clear) and visual tokens (this app's phosphor/sanguine/brass oklch
// palette instead of the old app's raw rgba literals) were adapted. See
// D:\Projects\40K\repos\cogitator-calibrator\src\components\CogitatorScanner.tsx.

const randInt = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1))

const SIZE = 460
const CENTER = SIZE / 2
const FIELD_RADIUS = 210
const NODE_MAX_HP = 10

interface Props {
  characterId: Id<'characters'>
  isGM: boolean
  onExit: () => void
  onRestart?: () => void
}

/** Max shield HP applied by Fortify. Drained before node HP. */
const SHIELD_MAX_HP = 20
/** Overcharge duration (ms): tapped node emits 2x dots. */
const OVERCHARGE_MS = 10000
/** Counter-emit shockwave: expansion duration & max radius (px). */
const SHOCKWAVE_MS = 900
const SHOCKWAVE_MAX_R = 220
/** Band thickness used for collision with red particles (px). */
const SHOCKWAVE_BAND = 14
/** Checkpoint-bank victory burst: expansion duration & max radius (px). */
const CHECKPOINT_BURST_MS = 1100
const CHECKPOINT_BURST_MAX_R = FIELD_RADIUS + 20

// This app's theme tokens (src/index.css) as literal oklch strings — canvas
// 2D fillStyle/strokeStyle needs real color strings, not CSS var() refs.
// green(player)=phosphor, red(hostile)=sanguine, neutral/shielded=brass
// (this app has no blue token; brass is the intended substitute).
const phosphor = (a: number) => `oklch(0.85 0.19 142 / ${a})`
const sanguine = (a: number) => `oklch(0.58 0.19 25 / ${a})`
const brass = (a: number) => `oklch(0.78 0.14 75 / ${a})`

interface NodeNet {
  id: number
  x: number
  y: number
  /** "red" = hostile machine-spirit, "green" = controlled, "neutral" = uncaptured */
  side: 'red' | 'green' | 'neutral'
  /** Hit points 0..NODE_MAX_HP. Hostile dot hits subtract 1; friendly dots heal up to max. */
  hp: number
  /** Shield HP from Fortify (0..SHIELD_MAX_HP). Absorbs hostile damage first. */
  shieldHp: number
  /** ms timestamp until which this node is overcharged (2x emission). */
  overchargeUntil: number
  /** number of attack dots currently in flight emitted by THIS node */
  emitted: number
  /** ms timestamp of last emission */
  lastEmit: number
  /** brief "hit" flash when attacked (ms remaining) */
  flash: number
  /** Origin tier — drives DATA generation rate when held by green. */
  origin: 'command' | 'neutral' | 'regular'
  /** Player-chosen emission target id (only meaningful for green nodes). */
  targetId: number | null
}

/** Per-run upgrade state. CNTR is now a per-cast shockwave (no persistent flag). */
interface UpgradeState {
  /** kept for hud/badge compatibility — unused now (always false). */
  counterEmit: boolean
}

const UPGRADE_COSTS = {
  overcharge: 30,
  fortify: 40,
  counterEmit: 35,
  repair: 10,
} as const

// Points-banking checkpoints. Clearing one of these stages flushes all
// pendingPoints accumulated since the previous checkpoint (or run start) to
// the shared party pool; exiting, restarting, or failing between checkpoints
// forfeits that unbanked total instead. Lines up with the tier labels below
// (novice ends at 2, adept — and the stage-5 difficulty wall — at 5, magos
// at 9), then every 5 stages beyond.
function isCheckpointStage(stage: number): boolean {
  if (stage === 2 || stage === 5 || stage === 9) return true
  return stage > 9 && (stage - 9) % 5 === 0
}

interface Edge {
  a: number
  b: number
}

interface Particle {
  fromId: number
  toId: number
  x: number
  y: number
  side: 'red' | 'green'
  /** progress 0..1 along the edge */
  t: number
  /** speed per ms along the edge length */
  speed: number
  /** cached edge length so we know how fast t advances */
  len: number
  /** progress value at spawn (used to compute traveled distance) */
  tStart: number
  dead: boolean
}

interface LevelDef {
  /** number of nodes (red+green only, neutral counted separately) */
  count: number
  /** how many of those start green (always >=1 to seed the player) */
  startGreen: number
  /** how many start red (hostile machine-spirit footholds) */
  startRed: number
  /** average extra edges per node beyond MST spine */
  extraEdges: number
  /** cap of in-flight attack dots per node */
  emitCap: number
  /** ms between emissions per node when allowed */
  emitInterval: number
  /** dot speed per ms (along edge) */
  dotSpeed: number
  /** number of shielded neutral (blue) nodes guarding the center */
  neutralCount: number
}

function levelFor(stage: number): LevelDef {
  // Global hardness multiplier, now tied to depth instead of a player-picked
  // difficulty — stages 1-4 play at the old "acolyte" tuning, 5-9 step up to
  // "techpriest", 10+ to "magos". Nobody chooses this; it just ramps as you
  // go deeper, same as everything else in this curve.
  const diffMul = stage < 5 ? 1 : stage < 10 ? 0.85 : 0.7
  // More hostile footholds from the start as the tier climbs.
  const diffRedBonus = stage < 5 ? 0 : stage < 10 ? 1 : 2

  // Larger, more complex lattices — randomized within a band so no two
  // stages of the same number look identical. Cap raised from 18 to 24 (hit
  // around stage 14 instead of stage 9) so the lattice keeps growing well
  // past the stage-5 wall instead of flatlining right after it.
  const baseCount = stage === 1 ? 5 : stage === 2 ? 7 : Math.min(24, 6 + stage + Math.floor(stage / 3))
  const count = Math.max(4, baseCount + randInt(-1, 2))

  // Asymmetric footholds: early stages favor green (red is at a disadvantage),
  // mid stages equalize, late stages flip and put green at a disadvantage.
  // startGreen bottoms out at 1 by design (stage 5) — that's the floor, not
  // a plateau, since the player always needs at least one seed node.
  const baseGreen = stage <= 2 ? 3 : stage <= 4 ? 2 : 1
  const startGreen = baseGreen
  // Red footholds kept climbing to a hard cap of 5 by stage 9 (old formula);
  // now eases toward a cap of 9, reached around stage 16, so the red side
  // keeps getting more dangerous well beyond the stage-5 spike.
  const baseRed = stage <= 1 ? 1 : stage <= 2 ? 1 : stage <= 3 ? 2 : stage <= 4 ? 2 : Math.min(9, 3 + Math.floor((stage - 4) / 2))
  const startRed = baseRed + diffRedBonus + (stage >= 3 ? randInt(0, 1) : 0)

  // Faster hacking early — reticle feels powerful, then tightens up.
  const earlyEmitMul = stage === 1 ? 2.2 : stage === 2 ? 1.6 : stage === 3 ? 1.2 : 1
  const earlyCapPenalty = stage === 1 ? 2 : stage === 2 ? 1 : 0

  // Randomized extra edges → varied topology (sparse vs. richly connected).
  const extraEdgesBase = Math.min(4, Math.floor(stage / 2))
  const extraEdges = extraEdgesBase + randInt(0, 2 + Math.floor(stage / 4))

  // Neutral shielded cluster — varies in size from stage to stage. Cap
  // raised from 6 to 9 (reached ~stage 16) to match the extended red ramp.
  const neutralBase = stage <= 1 ? 0 : stage <= 3 ? 1 : Math.min(9, Math.floor(stage / 2) + 1)
  const neutralCount = Math.max(0, neutralBase + (stage >= 2 ? randInt(-1, 1) : 0))

  return {
    count,
    startGreen,
    startRed,
    extraEdges,
    emitCap: Math.max(1, 3 + Math.floor(stage / 2) - earlyCapPenalty),
    emitInterval: Math.max(380, 900 - stage * 50) * diffMul * earlyEmitMul,
    dotSpeed: (0.00018 + stage * 0.00002) / diffMul,
    neutralCount,
  }
}

// Build a node graph that fits inside FIELD_RADIUS.
function buildLevel(stage: number) {
  const def = levelFor(stage)
  const nodes: NodeNet[] = []

  const makeNode = (x: number, y: number, side: 'red' | 'green' | 'neutral'): NodeNet => ({
    id: nodes.length,
    x,
    y,
    side,
    hp: NODE_MAX_HP,
    shieldHp: 0,
    overchargeUntil: 0,
    emitted: 0,
    lastEmit: 0,
    flash: 0,
    origin: side === 'neutral' ? 'neutral' : 'regular',
    targetId: null,
  })

  // ----- 1. Place shielded neutral nodes near the center first -----
  // They form a small cluster the player must breach to reach the far side.
  const minDist = stage > 6 ? 60 : 72
  const neutralCount = def.neutralCount
  if (neutralCount === 1) {
    nodes.push(makeNode(CENTER, CENTER, 'neutral'))
  } else if (neutralCount > 1) {
    const ringR = 38 + neutralCount * 6
    const offset = Math.random() * Math.PI * 2
    for (let i = 0; i < neutralCount; i++) {
      const a = offset + (i / neutralCount) * Math.PI * 2
      nodes.push(makeNode(CENTER + Math.cos(a) * ringR, CENTER + Math.sin(a) * ringR, 'neutral'))
    }
  }

  // ----- 2. Distribute red/green nodes around the outside -----
  const tries = 800
  let attempts = 0
  while (nodes.length < def.count + neutralCount && attempts < tries) {
    attempts++
    const a = Math.random() * Math.PI * 2
    // Bias placement away from the center so reds spawn around the neutral core.
    const minR = neutralCount > 0 ? 90 : 0
    const r = minR + Math.sqrt(Math.random()) * (FIELD_RADIUS - 40 - minR)
    const x = CENTER + Math.cos(a) * r
    const y = CENTER + Math.sin(a) * r
    let ok = true
    for (const n of nodes) {
      if (Math.hypot(n.x - x, n.y - y) < minDist) {
        ok = false
        break
      }
    }
    if (ok) nodes.push(makeNode(x, y, 'red'))
  }

  // Sort non-neutral nodes by distance to center, neutrals stay first.
  const neutrals = nodes.filter((n) => n.side === 'neutral')
  const others = nodes
    .filter((n) => n.side !== 'neutral')
    .sort((a, b) => Math.hypot(a.x - CENTER, a.y - CENTER) - Math.hypot(b.x - CENTER, b.y - CENTER))
  // Place green seed on the OPPOSITE side of the field from the neutral cluster
  // so the player has to push through. If no neutrals, just nearest-to-center.
  const arranged = [...neutrals, ...others]
  arranged.forEach((n, i) => (n.id = i))
  // Replace nodes array contents with sorted version.
  nodes.length = 0
  nodes.push(...arranged)

  // Equal start: both sides get `startGreen` nodes from opposite rims of the
  // field. Any remaining placed nodes become neutral (shielded) so the match
  // begins symmetrically and the middle is up for grabs.
  const placed = nodes.filter((n) => n.side !== 'neutral')
  // First, mark all placed nodes as neutral; we'll promote a balanced subset.
  for (const n of placed) {
    n.side = 'neutral'
  }
  if (placed.length > 0) {
    // Sort by distance from center, farthest first — rim footholds.
    const byRim = [...placed].sort((a, b) => Math.hypot(b.x - CENTER, b.y - CENTER) - Math.hypot(a.x - CENTER, a.y - CENTER))
    const maxPerSide = Math.floor(byRim.length / 2)
    const greenCount = Math.min(def.startGreen, maxPerSide)
    const greens = byRim.slice(0, greenCount)
    const remaining = byRim.filter((n) => !greens.includes(n))
    const greenCentroid = greens.length
      ? {
          x: greens.reduce((s, g) => s + g.x, 0) / greens.length,
          y: greens.reduce((s, g) => s + g.y, 0) / greens.length,
        }
      : { x: CENTER, y: CENTER }
    remaining.sort(
      (a, b) => Math.hypot(b.x - greenCentroid.x, b.y - greenCentroid.y) - Math.hypot(a.x - greenCentroid.x, a.y - greenCentroid.y),
    )
    const redCount = Math.min(def.startRed, remaining.length)
    const reds = remaining.slice(0, redCount)
    for (let i = 0; i < greens.length; i++) {
      greens[i].side = 'green'
      if (i === 0) greens[i].origin = 'command'
    }
    for (let i = 0; i < reds.length; i++) {
      reds[i].side = 'red'
      if (i === 0) reds[i].origin = 'command'
    }
  }

  // Build edges: nearest-neighbor MST-like spine + a few extra short edges.
  const edges: Edge[] = []
  const seen = new Set<string>()
  const pairKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  // Connect each node to its 2 nearest neighbors.
  for (const n of nodes) {
    const others2 = nodes
      .filter((o) => o.id !== n.id)
      .map((o) => ({ id: o.id, d: Math.hypot(o.x - n.x, o.y - n.y) }))
      .sort((a, b) => a.d - b.d)
    for (let k = 0; k < 2 && k < others2.length; k++) {
      const key = pairKey(n.id, others2[k].id)
      if (!seen.has(key)) {
        seen.add(key)
        edges.push({ a: n.id, b: others2[k].id })
      }
    }
  }

  // Sprinkle a few longer extras for harder levels.
  for (let i = 0; i < def.extraEdges; i++) {
    const a = Math.floor(Math.random() * nodes.length)
    let b = Math.floor(Math.random() * nodes.length)
    if (a === b) b = (b + 1) % nodes.length
    const key = pairKey(a, b)
    if (!seen.has(key)) {
      seen.add(key)
      edges.push({ a, b })
    }
  }

  // Precompute adjacency list — used every frame in emissions/relays.
  // Without this we re-scan every edge for every node, every tick.
  const adjacency: number[][] = nodes.map(() => [])
  for (const e of edges) {
    adjacency[e.a].push(e.b)
    adjacency[e.b].push(e.a)
  }

  return { nodes, edges, def, adjacency }
}

export function CogitatorScanner({ characterId, isGM, onExit, onRestart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const award = useMutation(api.cogitatorPoints.award)

  const [stage, setStage] = useState(1)
  const [stageBanner, setStageBanner] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [percentGreen, setPercentGreen] = useState(0)
  const [failed, setFailed] = useState(false)
  // HUD-mirror state for resource & upgrades (updated at ~5Hz from the loop).
  const [data, setData] = useState(0)
  const [upgrades, setUpgrades] = useState<UpgradeState>({ counterEmit: false })
  const [repairCooldown, setRepairCooldown] = useState(0)
  void repairCooldown
  // Cogitator points earned this run but not yet banked to the party pool —
  // lost entirely if the run ends (exit/restart/failure) before the next
  // checkpoint stage clears.
  const [pendingPoints, setPendingPoints] = useState(0)
  // Gates [esc]/restart behind a confirm step whenever doing so would
  // forfeit unbanked pendingPoints.
  const [confirmAction, setConfirmAction] = useState<{ type: 'exit' } | { type: 'restart' } | null>(null)
  // Victory overlay shown for a couple seconds whenever a checkpoint stage
  // clears and its pendingPoints actually bank — bigger deal than an
  // ordinary stage clear, so it gets its own beat instead of just cutting
  // straight to the next lattice's "++ NODE LATTICE NN ++" banner.
  const [checkpointCelebration, setCheckpointCelebration] = useState<{ amount: number } | null>(null)
  // Expanding brass rings drawn from the field center on a checkpoint bank.
  const checkpointBurstRef = useRef<{ t0: number }[]>([])

  // Currently selected green node (player tap selection).
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const selectedNodeIdRef = useRef<number | null>(null)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])
  void selectedNodeIdRef
  // Currently armed upgrade — next tapped green node receives it instead of cycling direction.
  const [pendingUpgrade, setPendingUpgrade] = useState<'overcharge' | 'fortify' | 'counter' | 'repair' | null>(null)
  const pendingUpgradeRef = useRef<typeof pendingUpgrade>(null)
  useEffect(() => {
    pendingUpgradeRef.current = pendingUpgrade
  }, [pendingUpgrade])
  // Visual repair pulses (centroid-radiating ring).
  const pulsesRef = useRef<{ x: number; y: number; t0: number }[]>([])
  // Floating "FORT" badges.
  const fortBadgesRef = useRef<{ x: number; y: number; until: number }[]>([])
  // Active counter-emit shockwaves (expanding rings that delete red dots).
  const shockwavesRef = useRef<{ x: number; y: number; t0: number }[]>([])

  // Bridges late-changing values into the RAF loop's tick(), whose effect
  // has an empty dependency array (mounted once) and so can't otherwise see
  // a fresh `award` mutation function or prop values from later renders —
  // same pattern as selectedNodeIdRef/pendingUpgradeRef above.
  const runBridgeRef = useRef({ award, characterId, isGM })
  useEffect(() => {
    runBridgeRef.current = { award, characterId, isGM }
  }, [award, characterId, isGM])

  // Persistent run-scoped state — survives stage transitions, resets on
  // full restart / failure-retry.
  const runRef = useRef<{
    data: number
    upgrades: UpgradeState
    repairCooldownMs: number
    pendingPoints: number
  }>({
    data: 0,
    upgrades: { counterEmit: false },
    repairCooldownMs: 0,
    pendingPoints: 0,
  })

  // Game world state (re-built on stage change)
  const worldRef = useRef<{
    nodes: NodeNet[]
    edges: Edge[]
    adjacency: number[][]
    def: LevelDef
    particles: Particle[]
    lastTs: number
    elapsed: number
    completed: boolean
    failed: boolean
    /** scoring stats for the current stage. */
    stage: number
    peakGreen: number
    lostNodes: number
    prevGreenCount: number
    reported: boolean
  }>({
    nodes: [],
    edges: [],
    adjacency: [],
    def: levelFor(1),
    particles: [],
    lastTs: 0,
    elapsed: 0,
    completed: false,
    failed: false,
    stage: 1,
    peakGreen: 0,
    lostNodes: 0,
    prevGreenCount: 0,
    reported: false,
  })

  const NODE_RADIUS = 14
  const HOVER_RADIUS = NODE_RADIUS + 8

  // Build level whenever stage changes.
  const initStage = useCallback(
    (n: number) => {
      const built = buildLevel(n)
      const initialGreen = built.nodes.filter((nd) => nd.side === 'green').length
      const initialPct = built.nodes.length > 0 ? Math.round((initialGreen / built.nodes.length) * 100) : 0
      // Stage 1 = fresh run → wipe data + upgrades.
      if (n === 1) {
        runRef.current = {
          data: 0,
          upgrades: { counterEmit: false },
          repairCooldownMs: 0,
          pendingPoints: 0,
        }
        setData(0)
        setUpgrades({ counterEmit: false })
        setRepairCooldown(0)
        setPendingPoints(0)
      }
      worldRef.current = {
        nodes: built.nodes,
        edges: built.edges,
        adjacency: built.adjacency,
        def: built.def,
        particles: [],
        lastTs: 0,
        elapsed: 0,
        completed: false,
        failed: false,
        stage: n,
        peakGreen: initialPct,
        lostNodes: 0,
        prevGreenCount: initialGreen,
        reported: false,
      }
      pulsesRef.current = []
      fortBadgesRef.current = []
      shockwavesRef.current = []
      setSelectedNodeId(null)
      setElapsed(0)
      setFailed(false)
      setPercentGreen(initialPct)
      setStageBanner(`++ NODE LATTICE ${String(n).padStart(2, '0')} ++`)
      window.setTimeout(() => setStageBanner(null), 1400)
    },
    [],
  )

  useEffect(() => {
    initStage(stage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initStage, stage])

  // ---- Tap-to-select / tap-to-aim handler on the scope canvas ----
  const handleScopeTap = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = ((e.clientX - rect.left) / rect.width) * SIZE
    const cy = ((e.clientY - rect.top) / rect.height) * SIZE
    const w = worldRef.current
    let hit: NodeNet | null = null
    let hitD = Infinity
    for (const n of w.nodes) {
      const d = Math.hypot(n.x - cx, n.y - cy)
      if (d < HOVER_RADIUS && d < hitD) {
        hit = n
        hitD = d
      }
    }
    if (!hit || hit.side !== 'green') return
    // If an upgrade is armed, apply it to the tapped node and DO NOT cycle direction.
    const armed = pendingUpgradeRef.current
    if (armed) {
      const applied = applyUpgradeToNode(armed, hit.id)
      if (applied) {
        setPendingUpgrade(null)
        setSelectedNodeId(hit.id)
      }
      return
    }
    // Tap a green node to cycle its guiding line through ALL adjacent nodes
    // (hostile, neutral, or friendly green — friendly aim relays/heals).
    const adj = w.adjacency[hit.id] || []
    const candidates: number[] = adj.slice()
    if (candidates.length === 0) {
      hit.targetId = null
    } else {
      // If no explicit target yet, the visible auto-aim is candidates[0],
      // so the first tap should advance to candidates[1].
      const curIdx = hit.targetId !== null ? candidates.indexOf(hit.targetId) : 0
      hit.targetId = candidates[(curIdx + 1) % candidates.length]
      hit.flash = Math.max(hit.flash, 200)
    }
    // Track last-tapped node so upgrades (Fortify) still know which one to apply to.
    setSelectedNodeId(hit.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    canvas.style.width = `${SIZE}px`
    canvas.style.height = `${SIZE}px`
    ctx.scale(dpr, dpr)

    // -------- Pre-rendered static background (disc gradient + grid rings) --------
    // Built ONCE per mount. Drawn each frame with a single drawImage call
    // instead of rebuilding the radial gradient + 4 stroked rings every tick.
    const bgCanvas = document.createElement('canvas')
    bgCanvas.width = SIZE * dpr
    bgCanvas.height = SIZE * dpr
    const bgCtx = bgCanvas.getContext('2d')!
    bgCtx.scale(dpr, dpr)
    const bgGrad = bgCtx.createRadialGradient(CENTER, CENTER, 20, CENTER, CENTER, FIELD_RADIUS)
    bgGrad.addColorStop(0, 'oklch(0.09 0.025 142)')
    bgGrad.addColorStop(0.6, 'oklch(0.05 0.015 142)')
    bgGrad.addColorStop(1, 'oklch(0.02 0.008 142)')
    bgCtx.beginPath()
    bgCtx.arc(CENTER, CENTER, FIELD_RADIUS, 0, Math.PI * 2)
    bgCtx.fillStyle = bgGrad
    bgCtx.fill()
    bgCtx.strokeStyle = phosphor(0.18)
    bgCtx.lineWidth = 1
    for (let rr = 50; rr <= FIELD_RADIUS; rr += 50) {
      bgCtx.beginPath()
      bgCtx.arc(CENTER, CENTER, rr, 0, Math.PI * 2)
      bgCtx.stroke()
    }

    // Faint starfield texture, baked in once alongside the rest of the
    // static background — reads as backdrop clutter (like the star-point
    // fields on in-universe cogitator star-map displays), never as a game
    // element, so it stays low-alpha phosphor rather than a new hue. Each
    // star gets a faint line to its nearest neighbor too — the same
    // "connected nodes" idiom as the real lattice's edges, just much
    // quieter, so the backdrop itself reads as a wider cogitator network.
    const stars: { x: number; y: number }[] = []
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * FIELD_RADIUS
      stars.push({ x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r })
    }
    bgCtx.strokeStyle = phosphor(0.1)
    bgCtx.lineWidth = 0.5
    for (let i = 0; i < stars.length; i++) {
      let nearest = -1
      let nearestD = Infinity
      for (let j = 0; j < stars.length; j++) {
        if (i === j) continue
        const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y)
        if (d < nearestD) {
          nearestD = d
          nearest = j
        }
      }
      if (nearest !== -1 && nearestD < 70) {
        bgCtx.beginPath()
        bgCtx.moveTo(stars[i].x, stars[i].y)
        bgCtx.lineTo(stars[nearest].x, stars[nearest].y)
        bgCtx.stroke()
      }
    }
    bgCtx.fillStyle = phosphor(1)
    for (const s of stars) {
      bgCtx.globalAlpha = 0.1 + Math.random() * 0.25
      bgCtx.beginPath()
      bgCtx.arc(s.x, s.y, Math.random() < 0.15 ? 1.3 : 0.7, 0, Math.PI * 2)
      bgCtx.fill()
    }
    bgCtx.globalAlpha = 1

    // -------- Pre-rendered node sprites (replaces per-frame shadowBlur) --------
    // shadowBlur forces an offscreen rasterization per shape per frame and is
    // the single biggest cost as node count grows. We bake each variant once
    // (idle + flashing × red/green/neutral) into a sprite and blit it.
    const SPRITE_PAD = 24 // room for the glow halo
    const SPRITE_SIZE = (NODE_RADIUS + SPRITE_PAD) * 2
    function makeNodeSprite(base: string, glow: string, fill: string, flashing: boolean, thickStroke: boolean): HTMLCanvasElement {
      const c = document.createElement('canvas')
      c.width = SPRITE_SIZE * dpr
      c.height = SPRITE_SIZE * dpr
      const cx = c.getContext('2d')!
      cx.scale(dpr, dpr)
      const mid = SPRITE_SIZE / 2
      // Soft glow as a radial gradient — much cheaper than shadowBlur.
      const blurR = flashing ? 18 : 8
      const halo = cx.createRadialGradient(mid, mid, NODE_RADIUS, mid, mid, NODE_RADIUS + blurR)
      halo.addColorStop(0, glow)
      halo.addColorStop(1, 'oklch(0 0 0 / 0)')
      cx.fillStyle = halo
      cx.beginPath()
      cx.arc(mid, mid, NODE_RADIUS + blurR, 0, Math.PI * 2)
      cx.fill()
      // outer ring
      cx.strokeStyle = base
      cx.lineWidth = thickStroke ? 2 : 1.5
      cx.beginPath()
      cx.arc(mid, mid, NODE_RADIUS, 0, Math.PI * 2)
      cx.stroke()
      // inner translucent fill
      cx.fillStyle = fill
      cx.beginPath()
      cx.arc(mid, mid, NODE_RADIUS - 2, 0, Math.PI * 2)
      cx.fill()
      // core dot
      cx.fillStyle = base
      cx.beginPath()
      cx.arc(mid, mid, 2, 0, Math.PI * 2)
      cx.fill()
      return c
    }
    const sprites = {
      green: {
        idle: makeNodeSprite(phosphor(1), phosphor(0.9), phosphor(0.15), false, false),
        flash: makeNodeSprite(phosphor(1), phosphor(0.9), phosphor(0.15), true, false),
      },
      red: {
        idle: makeNodeSprite(sanguine(1), sanguine(0.95), sanguine(0.18), false, false),
        flash: makeNodeSprite(sanguine(1), sanguine(0.95), sanguine(0.18), true, false),
      },
      neutral: {
        idle: makeNodeSprite(brass(1), brass(0.95), brass(0.18), false, true),
        flash: makeNodeSprite(brass(1), brass(0.95), brass(0.18), true, true),
      },
    }
    const SPRITE_HALF = SPRITE_SIZE / 2

    // Throttle React HUD updates so they don't re-render the wrapper 60×/s.
    let hudAccum = 0
    let lastPct = -1
    const tick = (ts: number) => {
      const w = worldRef.current
      const dt = w.lastTs ? Math.min(50, ts - w.lastTs) : 16
      w.lastTs = ts
      if (w.failed) {
        // Freeze the simulation on loss — keep rendering the static lattice
        // so the LOST banner reads against the final state.
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      w.elapsed += dt

      // ---------- DATA generation ----------
      // Credits are awarded only when a green dot actually damages a node
      // (see particle-arrival block below). No passive income.
      if (runRef.current.repairCooldownMs > 0) {
        runRef.current.repairCooldownMs = Math.max(0, runRef.current.repairCooldownMs - dt)
      }

      // ---------- Per-node housekeeping (flash decay, stale-target cleanup) ----------
      for (const n of w.nodes) {
        // Drop player-set targets only if the target node is gone or no
        // longer adjacent. Friendly green targets are allowed (relay/heal).
        if (n.targetId !== null) {
          const t = w.nodes[n.targetId]
          const adj = w.adjacency[n.id]
          if (!t || !adj || adj.indexOf(n.targetId) === -1) n.targetId = null
        }
        if (n.flash > 0) n.flash = Math.max(0, n.flash - dt)
      }

      // ---------- Node emissions ----------
      // A node may emit toward a neighbor of opposing color (direct attack),
      // or — if all neighbors are friendly — toward a friendly neighbor that
      // itself touches the front line, so backline nodes keep pumping out
      // reinforcements that travel forward to the fight.
      for (const n of w.nodes) {
        // Neutral nodes don't emit attack dots — they sit and shield.
        if (n.side === 'neutral') continue
        const overcharged = n.side === 'green' && n.overchargeUntil > ts
        let cap = w.def.emitCap
        let interval = w.def.emitInterval
        if (overcharged) {
          cap *= 2
          interval *= 0.5
        }
        const neighborIds = w.adjacency[n.id]
        if (!neighborIds || neighborIds.length === 0) continue
        if (n.emitted >= cap) continue
        if (ts - n.lastEmit < interval) continue
        // Hostile = the opposing colored side. Neutral nodes are also a
        // valid attack target since either side wants to capture them.
        let hostileCount = 0
        const hostile: NodeNet[] = []
        const frontFriends: NodeNet[] = []
        for (let ni = 0; ni < neighborIds.length; ni++) {
          const nb = w.nodes[neighborIds[ni]]
          if (nb.side !== n.side) {
            hostile.push(nb)
            hostileCount++
          }
        }
        if (hostileCount === 0) {
          for (let ni = 0; ni < neighborIds.length; ni++) {
            const nb = w.nodes[neighborIds[ni]]
            if (nb.side !== n.side) continue
            const nbAdj = w.adjacency[nb.id]
            for (let ki = 0; ki < nbAdj.length; ki++) {
              const otherId = nbAdj[ki]
              if (otherId === n.id) continue
              if (w.nodes[otherId].side !== n.side) {
                frontFriends.push(nb)
                break
              }
            }
          }
        }

        let target: NodeNet | undefined
        if (n.side === 'green' && n.targetId !== null) {
          const t = w.nodes[n.targetId]
          if (t) target = t
          else n.targetId = null
        }
        if (!target) {
          if (hostile.length > 0) target = hostile[0]
          else if (frontFriends.length > 0) target = frontFriends[0]
        }
        if (!target) continue

        const dxe = target.x - n.x
        const dye = target.y - n.y
        const len = Math.hypot(dxe, dye) || 1
        const tStart = Math.min(0.45, NODE_RADIUS / len)
        w.particles.push({
          fromId: n.id,
          toId: target.id,
          x: n.x + (dxe / len) * NODE_RADIUS,
          y: n.y + (dye / len) * NODE_RADIUS,
          side: n.side as 'red' | 'green',
          t: tStart,
          tStart,
          speed: w.def.dotSpeed,
          len,
          dead: false,
        })
        n.emitted += 1
        n.lastEmit = ts
      }

      // ---------- Shockwaves (CNTR) — annihilate red dots passing through ----------
      for (const sw of shockwavesRef.current) {
        const age = Math.max(0, ts - sw.t0)
        if (age > SHOCKWAVE_MS) continue
        const r = (age / SHOCKWAVE_MS) * SHOCKWAVE_MAX_R
        for (const p of w.particles) {
          if (p.dead || p.side !== 'red') continue
          const d = Math.hypot(p.x - sw.x, p.y - sw.y)
          if (Math.abs(d - r) < SHOCKWAVE_BAND) {
            p.dead = true
            w.nodes[p.fromId].emitted = Math.max(0, w.nodes[p.fromId].emitted - 1)
          }
        }
      }
      shockwavesRef.current = shockwavesRef.current.filter((s) => ts - s.t0 < SHOCKWAVE_MS)

      // ---------- Particle motion ----------
      // Snapshot node sides so that if a node flips mid-frame, subsequent
      // same-frame arrivals from the attacker still count as hostile hits
      // instead of "healing" the freshly-captured node.
      const sideAtFrameStart: ('green' | 'red' | 'neutral')[] = new Array(w.nodes.length)
      for (let ni = 0; ni < w.nodes.length; ni++) sideAtFrameStart[ni] = w.nodes[ni].side
      for (const p of w.particles) {
        if (p.dead) continue
        p.t += p.speed * dt
        const from = w.nodes[p.fromId]
        const to = w.nodes[p.toId]
        const toSideAtArrival = sideAtFrameStart[p.toId]
        // If the source node flipped color, the existing particle still belongs
        // to its original side — keeps the "fixed pool released" feel.
        p.x = from.x + (to.x - from.x) * p.t
        p.y = from.y + (to.y - from.y) * p.t
        // Arrival = touched the destination's circle edge, not its center.
        const arriveT = Math.max(0.55, 1 - NODE_RADIUS / (p.len || 1))
        if (p.t >= arriveT) p.t = arriveT

        if (p.t >= arriveT) {
          // arrived — apply hit to destination node
          p.dead = true
          w.nodes[p.fromId].emitted = Math.max(0, w.nodes[p.fromId].emitted - 1)
          let greenDamaged = false
          // distance this dot actually traveled along its edge (px)
          const traveled = Math.max(0, (p.t - (p.tStart ?? 0)) * (p.len || 0))

          if (toSideAtArrival === p.side) {
            // friendly arrival — heal if below max, otherwise relay onward.
            if (to.hp < NODE_MAX_HP) {
              to.hp = Math.min(NODE_MAX_HP, to.hp + 1)
              to.flash = Math.max(to.flash, 160)
            } else {
              const toAdj = w.adjacency[to.id]
              const hostileNext: NodeNet[] = []
              for (let ai = 0; ai < toAdj.length; ai++) {
                const nb = w.nodes[toAdj[ai]]
                if (nb.side !== p.side) hostileNext.push(nb)
              }
              if (hostileNext.length > 0) {
                const next = hostileNext[Math.floor(Math.random() * hostileNext.length)]
                const dxr = next.x - to.x
                const dyr = next.y - to.y
                const len = Math.hypot(dxr, dyr) || 1
                const tStart = Math.min(0.45, NODE_RADIUS / len)
                w.particles.push({
                  fromId: to.id,
                  toId: next.id,
                  x: to.x + (dxr / len) * NODE_RADIUS,
                  y: to.y + (dyr / len) * NODE_RADIUS,
                  side: p.side,
                  t: tStart,
                  tStart,
                  speed: w.def.dotSpeed,
                  len,
                  dead: false,
                })
                to.flash = Math.max(to.flash, 140)
              } else {
                to.flash = Math.max(to.flash, 180)
              }
            }
          } else {
            // hostile arrival — deal 1 damage. If hp hits 0, capture flips
            // the node to attacker's side at 1 HP (vulnerable foothold).
            if (to.shieldHp > 0) {
              to.shieldHp = Math.max(0, to.shieldHp - 1)
            } else {
              to.hp = Math.max(0, to.hp - 1)
            }
            to.flash = Math.max(to.flash, 280)
            if (p.side === 'green') greenDamaged = true
            if (to.hp <= 0) {
              to.side = p.side
              to.hp = 1
              to.flash = 460
            }
          }
          if (greenDamaged) {
            // data scales with how far the dot traveled before landing the hit
            runRef.current.data += traveled / 60
          }
        }
      }

      // ---------- Particle collision (cancel each other out) ----------
      // O(n^2) but particle counts stay small (≤ ~30).
      for (let i = 0; i < w.particles.length; i++) {
        const a = w.particles[i]
        if (a.dead) continue
        for (let j = i + 1; j < w.particles.length; j++) {
          const b = w.particles[j]
          if (b.dead) continue
          if (a.side === b.side) continue
          if (Math.hypot(a.x - b.x, a.y - b.y) < 7) {
            a.dead = true
            b.dead = true
            // free up emission slots so the source nodes can re-fire
            w.nodes[a.fromId].emitted = Math.max(0, w.nodes[a.fromId].emitted - 1)
            w.nodes[b.fromId].emitted = Math.max(0, w.nodes[b.fromId].emitted - 1)
            break
          }
        }
      }
      w.particles = w.particles.filter((p) => !p.dead)

      // ---------- Win check (single pass) ----------
      let greenCount = 0
      let redCount = 0
      let neutralCount = 0
      for (const n of w.nodes) {
        if (n.side === 'green') greenCount++
        else if (n.side === 'red') redCount++
        else neutralCount++
      }
      const total = w.nodes.length
      const pct = total > 0 ? Math.round((greenCount / total) * 100) : 0

      // Track stats for scoring.
      if (pct > w.peakGreen) w.peakGreen = pct
      if (greenCount < w.prevGreenCount) {
        w.lostNodes += w.prevGreenCount - greenCount
      }
      w.prevGreenCount = greenCount

      if (!w.completed && !w.failed && total > 0 && redCount === 0 && neutralCount === 0 && greenCount > 0) {
        w.completed = true
        if (!w.reported) {
          w.reported = true
          // Efficiency = blend of speed-vs-par and peak control.
          // Par scales with stage difficulty (~12s + 4s per stage, capped 60s).
          const parMs = Math.min(60000, 12000 + w.stage * 4000)
          const speedScore = Math.max(0, Math.min(1, parMs / Math.max(1, w.elapsed)))
          const peakScore = w.peakGreen / 100
          const efficiency = 0.55 * speedScore + 0.45 * peakScore
          const runResult: RunResult = {
            game: 'cogitators',
            level: w.stage,
            durationMs: w.elapsed,
            success: true,
            efficiency,
            setbacks: w.lostNodes,
          }
          // Stage points accumulate in pendingPoints, un-banked, until a
          // checkpoint stage clears. Tracked and previewed (timeline,
          // celebration) even for the GM's own character, same as a real
          // player would see — only the actual server award() is skipped for
          // GM (server also re-enforces this), so a GM playtest can see the
          // whole checkpoint flow without banking fake points to the party.
          const bridge = runBridgeRef.current
          let banked = false
          const points = cogitatorRunPoints(runResult)
          runRef.current.pendingPoints += points
          if (isCheckpointStage(w.stage) && runRef.current.pendingPoints > 0) {
            const amount = runRef.current.pendingPoints
            runRef.current.pendingPoints = 0
            banked = true
            if (!bridge.isGM) {
              void bridge.award({ characterId: bridge.characterId, amount, reason: `cogitator-checkpoint-${w.stage}` })
            }
            const burstNow = performance.now()
            checkpointBurstRef.current.push({ t0: burstNow }, { t0: burstNow + 150 }, { t0: burstNow + 300 })
            setCheckpointCelebration({ amount })
            window.setTimeout(() => setCheckpointCelebration(null), 2000)
          }
          setPendingPoints(runRef.current.pendingPoints)
          window.setTimeout(
            () => {
              setStage((s) => s + 1)
            },
            banked ? 2200 : 1200,
          )
        }
      } else if (!w.completed && !w.failed && total > 0 && greenCount === 0) {
        w.failed = true
        setFailed(true)
        const forfeited = Math.floor(runRef.current.pendingPoints)
        setStageBanner(forfeited > 0 ? `++ COGITATOR LOST · ${forfeited} PTS FORFEITED ++` : '++ COGITATOR LOST ++')
        w.reported = true
      }

      // ===== render =====
      ctx.clearRect(0, 0, SIZE, SIZE)

      // background disc + grid rings — pre-rendered once, blitted each frame.
      ctx.drawImage(bgCanvas, 0, 0, SIZE, SIZE)

      // edges
      ctx.lineWidth = 1
      for (const e of w.edges) {
        const a = w.nodes[e.a]
        const b = w.nodes[e.b]
        let stroke: string
        if (a.side === 'neutral' || b.side === 'neutral') stroke = brass(0.32)
        else if (a.side === 'red' && b.side === 'red') stroke = sanguine(0.35)
        else if (a.side === 'green' && b.side === 'green') stroke = phosphor(0.45)
        else stroke = brass(0.22)
        ctx.strokeStyle = stroke
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // particles (under nodes so nodes pop) — batched by side, no per-dot
      // shadowBlur (canvas shadows are extremely expensive at high counts).
      ctx.save()
      ctx.fillStyle = phosphor(1)
      ctx.beginPath()
      for (const p of w.particles) {
        if (p.side !== 'green') continue
        ctx.moveTo(p.x + 3, p.y)
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      }
      ctx.fill()
      ctx.fillStyle = sanguine(1)
      ctx.beginPath()
      for (const p of w.particles) {
        if (p.side !== 'red') continue
        ctx.moveTo(p.x + 3, p.y)
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      }
      ctx.fill()
      ctx.restore()

      // nodes — drawn from pre-rendered sprites (no per-frame shadowBlur).
      for (const n of w.nodes) {
        const isGreen = n.side === 'green'
        const isNeutral = n.side === 'neutral'
        const variant = n.flash > 0 ? 'flash' : 'idle'
        const sprite = sprites[n.side][variant]
        ctx.drawImage(sprite, n.x - SPRITE_HALF, n.y - SPRITE_HALF, SPRITE_SIZE, SPRITE_SIZE)

        // Command/HQ marker — a soft, slowly-breathing glow behind each
        // side's origin node (echoing the highlighted home-system marker on
        // in-universe star-map displays), NOT a stroked ring — a ring reads
        // as a shield/buff here since that's exactly what Fortify's shield
        // ring already means. Cosmetic only; at most 2 nodes per lattice
        // carry it, so a fresh radial gradient per frame is cheap.
        if (n.origin === 'command') {
          const glowColor = isGreen ? phosphor : sanguine
          const pulse = 0.5 + 0.5 * Math.sin(ts / 1400)
          const glowR = NODE_RADIUS + 16 + pulse * 8
          const grad = ctx.createRadialGradient(n.x, n.y, NODE_RADIUS, n.x, n.y, glowR)
          grad.addColorStop(0, glowColor(0.14 + pulse * 0.05))
          grad.addColorStop(1, glowColor(0))
          ctx.save()
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }

        // HP ring — full circle = max HP, depletes as the node takes hits.
        if (n.hp < NODE_MAX_HP) {
          const hpFrac = n.hp / NODE_MAX_HP
          const hpColor = isNeutral ? brass : isGreen ? phosphor : sanguine
          ctx.save()
          // dim track
          ctx.strokeStyle = hpColor(0.18)
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 5, 0, Math.PI * 2)
          ctx.stroke()
          // remaining HP arc
          ctx.strokeStyle = hpColor(0.95)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 5, -Math.PI / 2, -Math.PI / 2 + hpFrac * Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Shield ring — outer arc, depletes as shield HP drops. Tied to
        // phosphor (friendly buff) rather than a separate hue.
        if (n.shieldHp > 0) {
          const sFrac = n.shieldHp / SHIELD_MAX_HP
          ctx.save()
          ctx.strokeStyle = phosphor(0.22)
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.strokeStyle = phosphor(0.95)
          ctx.lineCap = 'round'
          ctx.shadowColor = phosphor(0.8)
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 9, -Math.PI / 2, -Math.PI / 2 + sFrac * Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Overcharge halo — pulsing gold ring while active.
        if (n.overchargeUntil > performance.now()) {
          const remain = n.overchargeUntil - performance.now()
          const pulse = 0.55 + 0.35 * Math.sin(performance.now() / 90)
          ctx.save()
          ctx.strokeStyle = brass(0.35 + pulse * 0.4)
          ctx.lineWidth = 1.5
          ctx.shadowColor = brass(0.8)
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 13, 0, Math.PI * 2)
          ctx.stroke()
          // remaining-time arc
          const tFrac = Math.max(0, Math.min(1, remain / OVERCHARGE_MS))
          ctx.strokeStyle = brass(0.9)
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 13, -Math.PI / 2, -Math.PI / 2 + tFrac * Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // hit flash ring
        if (n.flash > 0) {
          const a = Math.min(1, n.flash / 380)
          const flashColor = isNeutral ? brass : isGreen ? phosphor : sanguine
          ctx.save()
          ctx.strokeStyle = flashColor(a)
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(n.x, n.y, NODE_RADIUS + 4 + (1 - a) * 6, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }

      // ---------- Guiding lines (every emitting node points at its current aim) ----------
      ctx.save()
      ctx.lineCap = 'round'
      for (const n of w.nodes) {
        if (n.side === 'neutral') continue
        // Determine an aim direction: player target (if green) or any current
        // hostile/relay candidate. Cheap repeat of emission picker logic.
        let aim: NodeNet | null = null
        if (n.side === 'green' && n.targetId !== null) {
          const t = w.nodes[n.targetId]
          if (t) aim = t
        }
        if (!aim) {
          const adj = w.adjacency[n.id]
          for (let ai = 0; ai < adj.length; ai++) {
            const nb = w.nodes[adj[ai]]
            if (nb.side !== n.side) {
              aim = nb
              break
            }
          }
        }
        if (!aim) continue
        const dx = aim.x - n.x
        const dy = aim.y - n.y
        const d = Math.hypot(dx, dy) || 1
        const ux = dx / d
        const uy = dy / d
        const start = NODE_RADIUS + 2
        const playerSet = n.side === 'green' && n.targetId !== null
        const end = start + (playerSet ? 32 : 22)
        ctx.strokeStyle = n.side === 'green' ? (playerSet ? phosphor(0.98) : phosphor(0.6)) : sanguine(0.6)
        ctx.lineWidth = playerSet ? 6 : 4
        ctx.beginPath()
        ctx.moveTo(n.x + ux * start, n.y + uy * start)
        ctx.lineTo(n.x + ux * end, n.y + uy * end)
        ctx.stroke()
        // Arrow head for player-set aim so direction is unambiguous.
        if (playerSet) {
          const hx = n.x + ux * end
          const hy = n.y + uy * end
          const px = -uy
          const py = ux
          ctx.beginPath()
          ctx.moveTo(hx + ux * 6, hy + uy * 6)
          ctx.lineTo(hx + px * 5, hy + py * 5)
          ctx.lineTo(hx - px * 5, hy - py * 5)
          ctx.closePath()
          ctx.fillStyle = phosphor(0.98)
          ctx.fill()
        }
      }
      ctx.restore()

      // (Selection outline removed — guiding line itself is the feedback.)

      // ---------- Repair pulses (expanding ring) ----------
      const PULSE_MS = 700
      pulsesRef.current = pulsesRef.current.filter((p) => ts - p.t0 < PULSE_MS)
      for (const p of pulsesRef.current) {
        const t = (ts - p.t0) / PULSE_MS
        ctx.save()
        ctx.strokeStyle = phosphor(1 - t)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, 14 + t * 110, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // ---------- Counter-emit shockwaves (expanding bright ring) ----------
      for (const sw of shockwavesRef.current) {
        const age = Math.max(0, ts - sw.t0)
        if (age > SHOCKWAVE_MS) continue
        const t = age / SHOCKWAVE_MS
        const r = Math.max(0, t * SHOCKWAVE_MAX_R)
        ctx.save()
        ctx.strokeStyle = phosphor(0.95 * (1 - t))
        ctx.lineWidth = 3
        ctx.shadowColor = phosphor(0.9)
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(sw.x, sw.y, Math.max(0, r), 0, Math.PI * 2)
        ctx.stroke()
        // inner faint trailing ring
        ctx.strokeStyle = phosphor(0.4 * (1 - t))
        ctx.lineWidth = 1.5
        ctx.shadowBlur = 0
        ctx.beginPath()
        ctx.arc(sw.x, sw.y, Math.max(0, r - 8), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // ---------- Checkpoint-bank victory burst (expanding brass rings from center) ----------
      checkpointBurstRef.current = checkpointBurstRef.current.filter((b) => ts - b.t0 < CHECKPOINT_BURST_MS)
      for (const b of checkpointBurstRef.current) {
        const age = ts - b.t0
        if (age < 0) continue
        const t = age / CHECKPOINT_BURST_MS
        const r = t * CHECKPOINT_BURST_MAX_R
        ctx.save()
        ctx.strokeStyle = brass(0.9 * (1 - t))
        ctx.lineWidth = 3
        ctx.shadowColor = brass(0.9)
        ctx.shadowBlur = 16
        ctx.beginPath()
        ctx.arc(CENTER, CENTER, Math.max(0, r), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      fortBadgesRef.current = fortBadgesRef.current.filter((b) => b.until > ts)
      for (const b of fortBadgesRef.current) {
        ctx.save()
        const alpha = Math.min(1, (b.until - ts) / 600)
        ctx.fillStyle = phosphor(alpha)
        ctx.font = 'bold 9px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText('FORT', b.x, b.y - NODE_RADIUS - 8)
        ctx.restore()
      }

      // clip the drawing back to the disc
      ctx.globalCompositeOperation = 'destination-in'
      ctx.beginPath()
      ctx.arc(CENTER, CENTER, FIELD_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'

      // Update React HUD state at modest cadence (~5 Hz) so the surrounding
      // React tree doesn't re-render every animation frame.
      hudAccum += dt
      if (hudAccum >= 200) {
        hudAccum = 0
        setElapsed(w.elapsed)
        if (pct !== lastPct) {
          lastPct = pct
          setPercentGreen(pct)
        }
        setData(Math.floor(runRef.current.data))
        setRepairCooldown(Math.ceil(runRef.current.repairCooldownMs / 1000))
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ---- Upgrade application (called when player taps a green node with an upgrade armed) ----
  const applyUpgradeToNode = useCallback((kind: 'overcharge' | 'fortify' | 'counter' | 'repair', nodeId: number): boolean => {
    const node = worldRef.current.nodes[nodeId]
    if (!node || node.side !== 'green') return false
    const cost = UPGRADE_COSTS[kind === 'counter' ? 'counterEmit' : kind]
    if (runRef.current.data < cost) return false
    const now = performance.now()
    if (kind === 'overcharge') {
      node.overchargeUntil = Math.max(node.overchargeUntil, now + OVERCHARGE_MS)
      node.flash = Math.max(node.flash, 320)
    } else if (kind === 'fortify') {
      if (node.shieldHp >= SHIELD_MAX_HP) return false
      node.shieldHp = SHIELD_MAX_HP
      node.flash = Math.max(node.flash, 320)
      fortBadgesRef.current.push({ x: node.x, y: node.y, until: now + 2400 })
    } else if (kind === 'counter') {
      shockwavesRef.current.push({ x: node.x, y: node.y, t0: now })
      node.flash = Math.max(node.flash, 280)
    } else if (kind === 'repair') {
      if (node.hp >= NODE_MAX_HP) return false
      node.hp = NODE_MAX_HP
      node.flash = Math.max(node.flash, 280)
      pulsesRef.current.push({ x: node.x, y: node.y, t0: now })
    }
    runRef.current.data -= cost
    setData(Math.floor(runRef.current.data))
    return true
  }, [])

  // ---- Upgrade arming handlers (toggle: tap again to cancel) ----
  const armUpgrade = useCallback((kind: 'overcharge' | 'fortify' | 'counter' | 'repair') => {
    const cost = UPGRADE_COSTS[kind === 'counter' ? 'counterEmit' : kind]
    if (runRef.current.data < cost) return
    setPendingUpgrade((cur) => (cur === kind ? null : kind))
  }, [])
  const buyOvercharge = useCallback(() => armUpgrade('overcharge'), [armUpgrade])
  const buyFortify = useCallback(() => armUpgrade('fortify'), [armUpgrade])
  const buyCounterEmit = useCallback(() => armUpgrade('counter'), [armUpgrade])
  const buyRepair = useCallback(() => armUpgrade('repair'), [armUpgrade])

  const formatTime = (ms: number) => `${(Math.floor(ms / 100) / 10).toFixed(1)}s`

  // Runs the requested action directly, or — if it would forfeit unbanked
  // pendingPoints — parks it behind the confirm banner instead.
  const guardAction = useCallback(
    (action: { type: 'exit' } | { type: 'restart' }) => {
      if (runRef.current.pendingPoints > 0) {
        setConfirmAction(action)
        return
      }
      if (action.type === 'exit') onExit()
      else onRestart?.()
    },
    [onExit, onRestart],
  )
  const runConfirmedAction = useCallback(() => {
    const action = confirmAction
    setConfirmAction(null)
    if (!action) return
    if (action.type === 'exit') onExit()
    else onRestart?.()
  }, [confirmAction, onExit, onRestart])

  return (
    <div className="flex w-full select-none flex-col items-center gap-3 font-mono">
      {/* Top bar */}
      <div className="flex w-full max-w-[480px] items-center justify-between gap-2 px-1 text-[11px] uppercase tracking-widest text-phosphor-dim">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => guardAction({ type: 'restart' })}
            className="border border-phosphor-dim/60 px-2 py-1 text-[10px] uppercase leading-none tracking-widest text-phosphor-dim hover:border-phosphor hover:text-phosphor"
            title="Restart run"
          >
            ↺
          </button>
        </div>
        <button type="button" onClick={() => guardAction({ type: 'exit' })} className="uppercase text-phosphor-dim hover:text-phosphor">
          [esc]
        </button>
      </div>

      {confirmAction && (
        <div className="flex w-full max-w-[480px] items-center justify-between gap-2 border border-sanguine/70 bg-ink/80 px-3 py-2 text-[10px] uppercase tracking-widest text-sanguine">
          <span>forfeit {Math.floor(pendingPoints)} unbanked pts?</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runConfirmedAction}
              className="border border-sanguine px-2 py-1 leading-none hover:bg-sanguine hover:text-ink"
            >
              confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="border border-phosphor-dim/60 px-2 py-1 leading-none text-phosphor-dim hover:border-phosphor hover:text-phosphor"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Stage title */}
      <div className="-mt-1 flex w-full max-w-[480px] items-baseline justify-between px-1">
        <div className="border border-phosphor-faint px-2 py-1 leading-tight">
          <div className="font-mono text-[8px] tracking-[0.3em] text-phosphor-dim/70 uppercase">Module</div>
          <div className="font-mono text-[10px] tracking-[0.25em] text-phosphor uppercase">Node Lattice</div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-glow font-display text-3xl leading-none text-phosphor">{String(stage).padStart(2, '0')}</span>
          <span className="text-[10px] uppercase tracking-widest text-phosphor-dim">
            {stage < 3 ? '// novice' : stage < 6 ? '// adept' : stage < 10 ? '// magos' : '// omnissiah'}
          </span>
        </div>
      </div>
      {/* Scope — the circular clip lives on its own inner wrapper around just
          the canvas now, not the whole box, so the corner HUD readouts below
          (positioned against this square outer wrapper) land in the box's
          actual corners instead of the circle cutting them off. */}
      <div className="hud-corners relative" style={{ width: SIZE, height: SIZE }}>
        <div
          className="absolute inset-0"
          style={{
            borderRadius: '50%',
            overflow: 'hidden',
            border: '1px solid var(--color-phosphor-dim)',
          }}
        >
          <canvas ref={canvasRef} onPointerDown={handleScopeTap} className="block cursor-crosshair touch-none" />
        </div>

        {/* Checkpoint ring — wraps the outer rim of the scope itself instead
            of a separate strip, so it reads as part of the same instrument. */}
        <CircularCheckpointRing stage={stage} percentGreen={percentGreen} />

        {/* HUD — bracketed coordinate-readout boxes, same idiom as an
            in-universe star-map's CORD./AUTODECOUNT chips. */}
        <div className="absolute top-3 left-4 z-20 border border-phosphor-faint bg-ink/70 px-2 py-1 font-mono text-[10px] tracking-wider text-phosphor-dim">
          t={formatTime(elapsed)}
        </div>
        <div className="absolute top-3 right-4 z-20 border border-phosphor-faint bg-ink/70 px-2 py-1 font-mono text-[10px] tracking-wider text-phosphor-dim">
          ctrl {percentGreen}%
        </div>

        <div className="absolute bottom-3 left-4 z-20 border border-phosphor-faint bg-ink/70 px-2 py-1 font-mono text-[10px] tracking-wider">
          <span className="text-phosphor-dim">stage </span>
          <span className="text-glow text-phosphor">{String(stage).padStart(2, '0')}</span>
        </div>
        <div className="absolute bottom-3 right-4 z-20 border border-phosphor-faint bg-ink/70 px-2 py-1 font-mono text-[10px] tracking-wider">
          <span className="text-phosphor-dim">nodes </span>
          <span className="text-phosphor">{worldRef.current.nodes.length}</span>
        </div>

        {stageBanner && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div
              className={`font-display animate-tier-unlock text-2xl tracking-widest ${failed ? 'text-sanguine' : 'text-glow text-phosphor'}`}
              style={failed ? { textShadow: '0 0 18px color-mix(in oklab, var(--color-sanguine) 90%, transparent)' } : undefined}
            >
              {stageBanner}
            </div>
          </div>
        )}

        {checkpointCelebration && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="animate-tier-unlock animate-checkpoint-glow animate-checkpoint-shine flex flex-col items-center gap-1 border border-brass bg-ink/85 px-5 py-3 text-center">
              <span
                className="font-display text-xl tracking-[0.2em] text-brass"
                style={{ textShadow: '0 0 10px color-mix(in oklab, var(--color-brass) 85%, transparent)' }}
              >
                ++ CHECKPOINT SECURED ++
              </span>
              <span className="font-mono text-xs tracking-widest text-brass/90">{checkpointCelebration.amount} PTS BANKED</span>
            </div>
          </div>
        )}

        {failed && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-30 flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                if (stage === 1) initStage(1)
                else setStage(1)
              }}
              className="border border-sanguine/70 bg-ink/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-sanguine transition-colors hover:border-sanguine"
              style={{ textShadow: '0 0 8px color-mix(in oklab, var(--color-sanguine) 70%, transparent)' }}
            >
              ++ retry from lattice 01 ++
            </button>
          </div>
        )}
      </div>

      <div className="-mt-1 w-full max-w-[480px] px-1 text-center font-mono text-[8px] uppercase tracking-widest text-phosphor-dim/60">
        ◆ checkpoint — banks points on clear
      </div>

      {/* Resource & upgrade HUD — placed outside the scope for legibility */}
      <UpgradeStrip
        data={data}
        pendingPoints={pendingPoints}
        upgrades={upgrades}
        pendingUpgrade={pendingUpgrade}
        onOvercharge={buyOvercharge}
        onFortify={buyFortify}
        onCounter={buyCounterEmit}
        onRepair={buyRepair}
      />

      <div className="max-w-[420px] text-center text-[10px] uppercase tracking-widest text-phosphor-dim">
        {pendingUpgrade
          ? `${pendingUpgrade.toUpperCase()} armed · tap a green node to apply`
          : 'tap an upgrade to arm · tap a green node to aim or apply · capture all nodes to win'}
      </div>
    </div>
  )
}

/* --------------------------- Checkpoint ring HUD --------------------------- */

// Stage 1 sits at 12 o'clock; the next 10 stages wrap clockwise around the
// scope's outer rim. Once the player pushes past that page of 11, the ring
// re-pages to the next block (12-22, 23-33, ...) — same layout, just the
// next 11 lattice numbers and whichever of them are checkpoints.
const RING_PAGE_SIZE = 11
// Ticks are spaced as if there were RING_PAGE_SIZE+1 of them around the
// circle, but only RING_PAGE_SIZE are real — the extra slot is left empty
// right before 12 o'clock. That gives the lead-in progress arc for the
// page's first tick a dedicated, non-overlapping start point (see `segments`
// below) instead of it landing exactly on the last tick's position, and
// doubles as a visible seam marking the page boundary.
const RING_SLOT_COUNT = RING_PAGE_SIZE + 1
/** Marker + label sit just outside the scope's visible border (radius SIZE/2). */
const RING_MARKER_R = SIZE / 2
const RING_LABEL_R = RING_MARKER_R + 13
/** Arc length of one tick-to-tick slot (all slots are equal angle) — used as
 * the stroke-dasharray/dashoffset unit for the fill-progress trick below. */
const RING_SEGMENT_ARC_LEN = RING_MARKER_R * ((Math.PI * 2) / RING_SLOT_COUNT)

function CircularCheckpointRing({ stage, percentGreen }: { stage: number; percentGreen: number }) {
  const pageStart = Math.floor((stage - 1) / RING_PAGE_SIZE) * RING_PAGE_SIZE + 1
  const stages = Array.from({ length: RING_PAGE_SIZE }, (_, i) => pageStart + i)
  const ringPoint = (i: number) => {
    const angle = -Math.PI / 2 + (i / RING_SLOT_COUNT) * Math.PI * 2
    return { x: CENTER + RING_MARKER_R * Math.cos(angle), y: CENTER + RING_MARKER_R * Math.sin(angle) }
  }
  const markerPoints = stages.map((_, i) => ringPoint(i))
  // One "progress into this tick" segment per tick, including the page's
  // very first one — that lead-in comes from a virtual point one gap
  // counter-clockwise of 12 o'clock (there's no earlier real tick to start
  // from), so the loading-bar fill still has somewhere to grow from on the
  // stage you're actually on when it's the first tick of the page.
  const segments = stages.map((s, i) => ({
    from: i === 0 ? ringPoint(-1) : markerPoints[i - 1],
    to: markerPoints[i],
    targetStage: s,
  }))

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Rim track — one arc per tick, leading up to it. A dim base track
          always shows the full gap; a brighter, thicker overlay fills over
          it — fully once that tick is already cleared, and for the CURRENT
          stage's tick, only as far as percentGreen (the live lattice-control
          %), so it grows/shrinks like a loading bar as control shifts, via
          the standard stroke-dasharray/dashoffset progress-ring trick
          (offset counts down from the full arc length to 0 as the fraction
          goes from 0 to 1). */}
      <svg className="absolute inset-0" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {segments.map(({ from, to, targetStage }) => {
          const d = `M ${from.x} ${from.y} A ${RING_MARKER_R} ${RING_MARKER_R} 0 0 1 ${to.x} ${to.y}`
          const fraction = targetStage < stage ? 1 : targetStage === stage ? Math.max(0, Math.min(1, percentGreen / 100)) : 0
          return (
            <g key={targetStage}>
              <path d={d} fill="none" strokeLinecap="round" className="stroke-phosphor-dim" strokeOpacity={0.3} strokeWidth={1.5} />
              <path
                d={d}
                fill="none"
                strokeLinecap="round"
                className="stroke-phosphor"
                strokeOpacity={0.85}
                strokeWidth={4}
                style={{
                  strokeDasharray: RING_SEGMENT_ARC_LEN,
                  strokeDashoffset: RING_SEGMENT_ARC_LEN * (1 - fraction),
                  transition: 'stroke-dashoffset 300ms ease-out',
                }}
              />
            </g>
          )
        })}
      </svg>
      {stages.map((s, i) => {
        const { x, y } = markerPoints[i]
        const angle = -Math.PI / 2 + (i / RING_SLOT_COUNT) * Math.PI * 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const isCp = isCheckpointStage(s)
        const state: 'cleared' | 'current' | 'upcoming' = s < stage ? 'cleared' : s === stage ? 'current' : 'upcoming'
        return (
          <div key={s}>
            <div
              title={
                isCp
                  ? `Lattice ${String(s).padStart(2, '0')} — checkpoint, banks all pending pts on clear`
                  : `Lattice ${String(s).padStart(2, '0')}`
              }
              className={[
                'pointer-events-auto absolute flex items-center justify-center border transition-all',
                isCp ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5 rounded-full',
                isCp
                  ? state === 'cleared'
                    ? 'border-brass bg-brass'
                    : state === 'current'
                      ? 'animate-checkpoint-glow border-brass bg-brass/50'
                      : 'border-brass/50'
                  : state === 'cleared'
                    ? 'border-phosphor bg-phosphor'
                    : state === 'current'
                      ? 'animate-pulse border-phosphor bg-phosphor/40'
                      : 'border-phosphor-dim/40',
              ].join(' ')}
              style={{
                left: x,
                top: y,
                transform: `translate(-50%, -50%)${isCp ? ' rotate(45deg)' : ''}`,
              }}
            />
            <span
              className={`absolute text-[8px] tabular-nums ${isCp ? 'text-brass' : 'text-phosphor-dim/70'}`}
              style={{
                left: CENTER + RING_LABEL_R * cos,
                top: CENTER + RING_LABEL_R * sin,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {String(s).padStart(2, '0')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ----------------------------- Upgrade overlay HUD ----------------------------- */

interface UpgradeStripProps {
  data: number
  pendingPoints: number
  upgrades: UpgradeState
  pendingUpgrade: 'overcharge' | 'fortify' | 'counter' | 'repair' | null
  onOvercharge: () => void
  onFortify: () => void
  onCounter: () => void
  onRepair: () => void
}

function UpgradeStrip({ data, pendingPoints, upgrades, pendingUpgrade, onOvercharge, onFortify, onCounter, onRepair }: UpgradeStripProps) {
  void upgrades
  return (
    <div className="mt-3 flex w-full max-w-[480px] flex-wrap items-center justify-center gap-2 border border-phosphor-dim/50 bg-ink/70 px-3 py-2">
      <div className="mr-1 flex items-baseline gap-1.5 border-r border-phosphor-dim/40 pr-3">
        <span className="text-[10px] uppercase tracking-[0.25em] text-phosphor-dim">data</span>
        <span className="text-glow font-display text-base leading-none tabular-nums text-phosphor">{data}</span>
      </div>
      <div className="mr-1 flex items-baseline gap-1.5 border-r border-phosphor-dim/40 pr-3" title="Unbanked Cogitator points — lost if this run ends before the next checkpoint">
        <span className="text-[10px] uppercase tracking-[0.25em] text-phosphor-dim">pts</span>
        <span className="text-glow font-display text-base leading-none tabular-nums text-phosphor">{Math.floor(pendingPoints)}</span>
      </div>
      <UpgradeButton
        label="OVRC"
        cost={UPGRADE_COSTS.overcharge}
        disabled={data < UPGRADE_COSTS.overcharge}
        armed={pendingUpgrade === 'overcharge'}
        onClick={onOvercharge}
        title={`Arm: tap a green node to make it emit 2× dots for 10s — ${UPGRADE_COSTS.overcharge} data`}
      />
      <UpgradeButton
        label="FORT"
        cost={UPGRADE_COSTS.fortify}
        disabled={data < UPGRADE_COSTS.fortify}
        armed={pendingUpgrade === 'fortify'}
        onClick={onFortify}
        title={`Arm: tap a green node to add a 20HP shield — ${UPGRADE_COSTS.fortify} data`}
      />
      <UpgradeButton
        label="CNTR"
        cost={UPGRADE_COSTS.counterEmit}
        disabled={data < UPGRADE_COSTS.counterEmit}
        armed={pendingUpgrade === 'counter'}
        onClick={onCounter}
        title={`Arm: tap a green node to fire a shockwave that annihilates red dots — ${UPGRADE_COSTS.counterEmit} data`}
      />
      <UpgradeButton
        label="RPR"
        cost={UPGRADE_COSTS.repair}
        disabled={data < UPGRADE_COSTS.repair}
        armed={pendingUpgrade === 'repair'}
        onClick={onRepair}
        title={`Arm: tap a green node to repair it to full HP — ${UPGRADE_COSTS.repair} data`}
      />
    </div>
  )
}

interface UpgradeButtonProps {
  label: string
  cost: number | null
  disabled: boolean
  maxed?: boolean
  armed?: boolean
  onClick: () => void
  title: string
}

function UpgradeButton({ label, cost, disabled, maxed, armed, onClick, title }: UpgradeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !armed}
      title={title}
      className={[
        'flex items-center gap-1 border px-2 py-1 text-[10px] uppercase leading-none tracking-[0.18em] transition-colors',
        armed
          ? 'animate-pulse border-phosphor bg-phosphor text-ink shadow-[0_0_12px_oklch(0.85_0.19_142/0.7)]'
          : maxed
            ? 'border-phosphor/70 bg-phosphor/10 text-phosphor'
            : disabled
              ? 'cursor-not-allowed border-phosphor-dim/30 text-phosphor-dim/40'
              : 'border-phosphor-dim/70 text-phosphor-dim hover:border-phosphor hover:text-phosphor',
      ].join(' ')}
    >
      <span>{label}</span>
      {cost !== null && <span className={armed ? 'tabular-nums text-ink' : 'tabular-nums text-phosphor/70'}>{cost}</span>}
    </button>
  )
}
