// Geometry extracted from public/Peril_Pentagram.svg (Illustrator export).
// These are fixed properties of that specific file — re-extract (grep the
// file for `id="RuneOrigin` and the root `viewBox`) if it's ever re-exported
// with different proportions.
export const PERIL_ARTWORK_URL = '/Peril_Pentagram.svg'
export const PERIL_VIEW_BOX = '0 0 1173.62577 1244.72207'

// The exact <g> ids for each die slot, in file/document order — this order
// already runs clockwise starting from the top slot (verified against each
// RuneOrigin's coordinates), matching how Peril.tsx numbers its dice.
export const PERIL_SLOT_IDS = [
  'RuneSlot1',
  'RuneSlot2',
  'RuneSlot3',
  'RuneSlot4',
  'RuneSlot5',
  'RuneSlot6',
  'RuneSlot7',
  'RuneSlot_8',
]

// RuneOrigin circle centers, same order as PERIL_SLOT_IDS — the pivot point
// for that slot's rune artwork and where its die-value number is drawn.
export const PERIL_SLOT_ORIGINS: { x: number; y: number }[] = [
  { x: 580.41955, y: 148.40071 },
  { x: 896.07613, y: 279.10839 },
  { x: 1026.7838, y: 594.76496 },
  { x: 895.81398, y: 910.15938 },
  { x: 580.41955, y: 1041.12921 },
  { x: 264.76879, y: 910.41573 },
  { x: 134.05531, y: 594.67869 },
  { x: 265.01395, y: 278.52379 },
]

// The sigil's true visual center, per the artist-placed RotationRingCenter
// marker inside the Rotation Ring group (not the viewBox's geometric
// center — the artwork isn't symmetric within its bounding box, e.g. the
// bottom crescent accent extends further than the top one, so half-the-
// viewBox was measurably off). Used both as the Rotation Ring's spin pivot
// and the total's landing spot.
export const PERIL_CENTER = { x: 580.41955, y: 593.96954 }

// Fetched once and cached module-wide (the artwork never changes at
// runtime) — strips the file's own <defs>/<style> since PerilSigil supplies
// its own glow filter and warp coloring instead of the exported flat white.
let cachedArtwork: Promise<string> | null = null
export function loadPerilArtwork(): Promise<string> {
  cachedArtwork ??= fetch(PERIL_ARTWORK_URL)
    .then((res) => res.text())
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
      return Array.from(doc.documentElement.children)
        .filter((el) => el.tagName.toLowerCase() !== 'defs')
        .map((el) => el.outerHTML)
        .join('')
    })
  return cachedArtwork
}
