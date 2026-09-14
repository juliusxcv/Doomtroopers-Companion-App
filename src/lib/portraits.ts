// Ported from the old app's player-avatars backup — static files, not
// vault-sourced, same call as Autopsy.tsx's CREATURE_IMAGES (binary assets
// stay out of the vault-sync pipeline). Keyed by exact roster name; shared
// between the Operator Profile screen and the header's avatar button.
export const PORTRAITS: Record<string, string> = {
  'Vexilia Thornkell': '/characters/vex.jpg',
  'Helbrecht Nullis': '/characters/nullis.jpg',
  'Isabella Alderidge': '/characters/isabella.jpg',
  'Gideon Rook': '/characters/gideon_rook.jpg',
  'ALB-XXIII': '/characters/albxxiii.jpg',
  Slabs: '/characters/slabs.jpg',
}

export function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
