export const RARITIES = ['scrap', 'common', 'uncommon', 'rare', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_GLYPH: Record<Rarity, string> = {
  scrap: '·',
  common: '○',
  uncommon: '◇',
  rare: '✦',
  legendary: '★',
}

// Tailwind utility classes generated from the theme's --color-rarity-* tokens
// (see src/index.css). Kept as one lookup so Autopsy and Inventory always
// agree on what each tier looks like.
export const RARITY_TEXT: Record<Rarity, string> = {
  scrap: 'text-rarity-scrap',
  common: 'text-rarity-common',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  legendary: 'text-rarity-legendary',
}

export const RARITY_BORDER: Record<Rarity, string> = {
  scrap: 'border-rarity-scrap',
  common: 'border-rarity-common',
  uncommon: 'border-rarity-uncommon',
  rare: 'border-rarity-rare',
  legendary: 'border-rarity-legendary',
}
