import type { StatKey } from '../components/StatBlock'

export type StanceOption = {
  name: string
  // Numeric stat deltas a few options carry, e.g. ALB-XXIII's Aggressor
  // (MV+1"/DEF-1). Most options are pure weapon-rule text with nothing to
  // apply to the stat grid, so this is optional.
  deltas?: Partial<Record<StatKey, number>>
}

export type StanceConfig = {
  // Matches the meta-ability's `name` in that character's `abilities` array
  // (e.g. "Doctrina Imperatives") — see convex/schema.ts:characters.
  metaAbilityName: string
  options: StanceOption[]
}

// Maps a character name to their start-of-turn stance-pick ability. The
// options' full descriptions already live in that character's vault-authored
// `abilities` array (see convex/schema.ts) — this config only adds the
// numeric stat deltas a few of them carry, since the vault text is prose,
// not machine-readable rules.
export const STANCES: Record<string, StanceConfig> = {
  'ALB-XXIII': {
    metaAbilityName: 'Doctrina Imperatives',
    options: [
      { name: 'Protector' },
      { name: 'Conqueror' },
      { name: 'Bulwark', deltas: { mv: -1 } },
      // DEF is a roll target ("5+") where a lower number is better, so
      // "worsen DEF by 1" raises the printed number rather than lowering it.
      { name: 'Aggressor', deltas: { mv: 1, def: 1 } },
      { name: 'Neutral' },
    ],
  },
  'Gideon Rook': {
    metaAbilityName: 'Skill at Arms',
    options: [
      { name: "Light 'Em Up" },
      { name: 'Strike Fast', deltas: { mv: 1 } },
      { name: 'Ice in your Veins' },
      { name: 'For Ganymede!' },
    ],
  },
}
