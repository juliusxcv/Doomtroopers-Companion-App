// Per-ability icon art, keyed by exact ability name — same static-file
// pattern as PORTRAITS in src/lib/portraits.ts (binary assets stay out of
// the vault-sync pipeline). AbilityIcon in StatBlock.tsx falls back to a
// placeholder glyph for any name not listed here.
//
// ALB-XXIII's 5 Doctrina Imperatives and Gideon Rook's 4 Skill at Arms
// options — see src/lib/stances.ts for the mechanics these render alongside.
export const ABILITY_ICONS: Record<string, string> = {
  Protector: '/abilities/ALB_Protector.jpg',
  Conqueror: '/abilities/ALB_Conqueror.jpg',
  Bulwark: '/abilities/ALB_Bulwark.jpg',
  Aggressor: '/abilities/ALB_Aggressor.jpg',
  Neutral: '/abilities/ALB_Neutral.jpg',
  "Light 'Em Up": '/abilities/Gideon_LightemUp.jpg',
  'Strike Fast': '/abilities/Gideon_StrikeFast.jpg',
  'Ice in your Veins': '/abilities/Gideon_Iceinyourveins.jpg',
  'For Ganymede!': '/abilities/Gideon_ForGanymede.jpg',
}
