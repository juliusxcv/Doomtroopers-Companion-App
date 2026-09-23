import type { StatKey } from '../components/StatBlock'

export type StanceOption = {
  name: string
  // Numeric stat deltas a few options carry, e.g. ALB-XXIII's Aggressor
  // (MV+1"/DEF-1). Most options are pure weapon-rule text with nothing to
  // apply to the stat grid, so this is optional.
  deltas?: Partial<Record<StatKey, number>>
  // Only set when this option has no matching entry in the character's
  // `abilities` array to read a description from — e.g. Isabella's Dual
  // Wield branches, which are split out of one combined ability paragraph
  // rather than authored as separate named abilities like ALB-XXIII's or
  // Gideon Rook's stance options are.
  description?: string
}

export type StanceConfig = {
  // Matches the meta-ability's `name` in that character's `abilities` array
  // (e.g. "Doctrina Imperatives") — see convex/schema.ts:characters.
  metaAbilityName: string
  options: StanceOption[]
}

// Maps a character name to an ability where they pick one of several named,
// mutually-exclusive options — most (ALB-XXIII, Gideon Rook) re-pick every
// activation; Isabella's is a standing loadout choice instead, but the
// mechanic (one active choice, shown the same way) is identical either way.
// Where an option's full description already lives in that character's
// vault-authored `abilities` array (see convex/schema.ts), it's read from
// there rather than duplicated here — this config only adds the numeric
// stat deltas a few options carry and, where no separate ability entry
// exists for an option, its description directly (see `description` above).
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
  'Isabella Alderidge': {
    metaAbilityName: 'Dual Wield',
    options: [
      {
        name: 'Ranged',
        description:
          'Whenever you perform a shoot action while equipped with two ranged weapons, you may fire both of those weapons in any order. You may shoot at two different targets.',
      },
      {
        name: 'Melee',
        description:
          'Whenever you perform a fight action while equipped with two melee weapons, you may choose the weapons profile of either melee weapon, and increase the ATK stat by 1 and gain the Ceaseless weapon rule.',
      },
      { name: 'Single', description: 'Not currently dual-wielding — using a standard single-weapon loadout.' },
    ],
  },
}
