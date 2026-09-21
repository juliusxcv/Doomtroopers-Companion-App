import { PERIL_CENTER } from './perilArtwork'

// A pose about the sigil's center, composed by hand as translate(center)
// rotate() scale() translate(-center) — same reason as the Rotation Ring's
// spin: transform-origin / transform-box weren't honored reliably on SVG
// groups here, so the pivot is baked into the transform itself.
function pose(dx: number, dy: number, rotDeg: number, scale: number) {
  const { x, y } = PERIL_CENTER
  return `translate(${dx}px, ${dy}px) translate(${x}px, ${y}px) rotate(${rotDeg}deg) scale(${scale}) translate(${-x}px, ${-y}px)`
}

// [offset, along-the-recoil, sideways, twist, scale] — a sharp recoil away
// from the hit, then a decaying rebound/shudder around rest, like something
// flinching and fighting to hold itself together.
const FLINCH_BEATS: [number, number, number, number, number][] = [
  [0.09, 1, 0, 1, 0.92],
  [0.2, 0.1, 0.55, -0.7, 1.03],
  [0.33, 0.6, -0.45, 0.5, 0.965],
  [0.46, -0.1, 0.35, -0.35, 1.015],
  [0.6, 0.25, -0.22, 0.22, 0.99],
  [0.78, -0.05, 0.1, -0.1, 1.004],
]

const RECOIL_UNITS = 46
const TWIST_DEG = 3.4

/** Recoils away from where the sigil was hit (tap point in viewBox units). */
export function buildFlinchKeyframes(tapX: number, tapY: number, intensity: number): Keyframe[] {
  let ax = PERIL_CENTER.x - tapX
  let ay = PERIL_CENTER.y - tapY
  let len = Math.hypot(ax, ay)
  if (len < 1) {
    const a = Math.random() * Math.PI * 2
    ax = Math.cos(a)
    ay = Math.sin(a)
    len = 1
  }
  ax /= len
  ay /= len
  const px = -ay
  const py = ax
  const twistSign = tapX < PERIL_CENTER.x ? 1 : -1
  const amp = RECOIL_UNITS * intensity
  const twist = TWIST_DEG * intensity * twistSign

  const frames: Keyframe[] = [{ offset: 0, transform: pose(0, 0, 0, 1), easing: 'cubic-bezier(0.08, 0.9, 0.2, 1)' }]
  for (const [offset, along, side, twistK, scale] of FLINCH_BEATS) {
    frames.push({
      offset,
      transform: pose(
        (ax * along + px * side) * amp,
        (ay * along + py * side) * amp,
        twist * twistK,
        1 + (scale - 1) * intensity,
      ),
      easing: 'ease-in-out',
    })
  }
  frames.push({ offset: 1, transform: pose(0, 0, 0, 1) })
  return frames
}

/** A red pain-flash blooming off the whole sigil — sharp in, long fade out. */
export function buildPainFlashKeyframes(intensity: number): Keyframe[] {
  const glow = `drop-shadow(0 0 ${Math.round(70 * intensity)}px color-mix(in oklab, var(--color-sanguine) 95%, transparent))`
  return [
    { offset: 0, filter: 'drop-shadow(0 0 0 transparent)', easing: 'cubic-bezier(0.1, 0.85, 0.2, 1)' },
    { offset: 0.1, filter: glow, easing: 'ease-out' },
    { offset: 1, filter: 'drop-shadow(0 0 0 transparent)' },
  ]
}
