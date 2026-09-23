// Per-ability icon art, keyed by exact ability name — same static-file
// pattern as PORTRAITS in src/lib/portraits.ts (binary assets stay out of
// the vault-sync pipeline). AbilityIcon in StatBlock.tsx falls back to a
// placeholder glyph for any name not listed here.
//
// ALB-XXIII's 5 Doctrina Imperatives and Gideon Rook's 4 Skill at Arms
// options — see src/lib/stances.ts for the mechanics these render alongside.
//
// Source files were handed over as ~745x854 JPEGs (90-140KB each), way
// larger than the ~130-180px they ever render at in the ability-bar slots
// (see PlayerProfile.tsx's AbilitySlot). Downscaled to 400px wide (2x
// headroom for retina) and converted to WebP, which compresses this kind of
// high-contrast halftone line art noticeably better than JPEG — 19-36KB
// each, ~75% smaller, with no visible quality loss at display size.
export const ABILITY_ICONS: Record<string, string> = {
  Protector: '/abilities/ALB_Protector.webp',
  Conqueror: '/abilities/ALB_Conqueror.webp',
  Bulwark: '/abilities/ALB_Bulwark.webp',
  Aggressor: '/abilities/ALB_Aggressor.webp',
  Neutral: '/abilities/ALB_Neutral.webp',
  "Light 'Em Up": '/abilities/Gideon_LightemUp.webp',
  'Strike Fast': '/abilities/Gideon_StrikeFast.webp',
  'Ice in your Veins': '/abilities/Gideon_Iceinyourveins.webp',
  'For Ganymede!': '/abilities/Gideon_ForGanymede.webp',
}
