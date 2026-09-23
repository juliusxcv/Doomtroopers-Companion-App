export type ToggleConfig = {
  // Matches the ability's `name` in that character's `abilities` array.
  metaAbilityName: string
  onLabel: string
  offLabel: string
}

export const ABILITY_TOGGLES: Record<string, ToggleConfig> = {
  'Isabella Alderidge': {
    metaAbilityName: 'Master Tactician',
    onLabel: 'Tac Marker Deployed',
    offLabel: 'Deploy Tac Marker',
  },
}
