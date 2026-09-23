export type SpendOption = {
  // Matches an ability name in that character's `abilities` array when one
  // exists (Helbrecht's "1 FP - GUIDANCE" etc.) so its description is read
  // from there rather than duplicated here — see convex/schema.ts. Slabs has
  // no separate per-tier ability entry for his one spend action, so
  // `description` is supplied directly for that case.
  name: string
  cost: number
  description?: string
}

export type ResourceConfig = {
  // Matches the meta-ability's `name` in that character's `abilities` array
  // (e.g. "Acts of Faith").
  metaAbilityName: string
  resourceLabel: string
  // Faith caps at 5; Wrecka has no stated cap.
  cap?: number
  spendOptions: SpendOption[]
  // Wrecka points are lost after an activation with no shoot/fight action —
  // the app can't detect that, so this shows a manual "Clear" button.
  manualClear?: boolean
}

export const ABILITY_RESOURCES: Record<string, ResourceConfig> = {
  'Helbrecht Nullis': {
    metaAbilityName: 'Acts of Faith',
    resourceLabel: 'Faith',
    cap: 5,
    spendOptions: [
      { name: '1 FP - GUIDANCE', cost: 1 },
      { name: '2 FP - GUIDANCE', cost: 2 },
      { name: '3 FP - GUIDANCE', cost: 3 },
    ],
  },
  Slabs: {
    metaAbilityName: 'Wrecka',
    resourceLabel: 'Wrecka',
    spendOptions: [
      {
        name: 'Retain Fail',
        cost: 1,
        description: 'Retain a fail as a success instead when shooting, fighting, or retaliating.',
      },
    ],
    manualClear: true,
  },
}
