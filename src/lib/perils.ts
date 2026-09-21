// The Perils of the Warp table — 48 entries, one per possible sum of the
// psyker's peril dice (min 1 for 1D6, max 48 for 8D6). The table's own
// "Roll" column IS the target sum, not a separate lookup key: rolling N d6
// and summing them yields a value in [N, 6N], and whichever entry's `roll`
// equals that sum is the peril that triggers. This is why the table needs
// no probability weighting at resolution time — the probabilities in the
// source spreadsheet (chance of that Roll value occurring for each peril
// level) fall out naturally from the dice sum distribution, they aren't a
// separate roll table to interpret.
export type Peril = {
  roll: number
  name: string
  text: string
  consequence: string
}

export const MIN_PERIL_LEVEL = 1
export const MAX_PERIL_LEVEL = 8

export const PERILS: Peril[] = [
  {
    roll: 1,
    name: `Voices of the Void`,
    text: `Disembodied whispers flood the psyker's thoughts, revealing secrets… or lies.`,
    consequence: `Tell a truth or a lie.`,
  },
  {
    roll: 2,
    name: `Entity Watching`,
    text: `All nearby creatures feel watched.`,
    consequence: ``,
  },
  {
    roll: 3,
    name: `Memory Worm`,
    text: `What was that i wanted to say?`,
    consequence: `All friendly Operatives within Line of Sight forget something Trivial.`,
  },
  {
    roll: 4,
    name: `The Earth Protests`,
    text: `The ground groans and trembles as if recoiling from the psyker's presence.`,
    consequence: `The ground shakes ominously.`,
  },
  {
    roll: 5,
    name: `Whispers Within`,
    text: `Psyker hears distant voices reciting impossible equations or riddles.`,
    consequence: `Ominous Music starts to play.`,
  },
  {
    roll: 6,
    name: `Cryptic Sigil Manifestation`,
    text: `Unknown symbols appear in the air—some glow and burn before vanishing.`,
    consequence: ``,
  },
  {
    roll: 7,
    name: `Blood Hum`,
    text: `Psyker's heartbeat becomes audible to others—like chanting.`,
    consequence: `Operatives in a 3" radius hear your heartbeat hammering.`,
  },
  {
    roll: 8,
    name: `Flesh Flux`,
    text: `The psyker's form begins distorting—fingers elongate, eyes multiply, or skin glistens with warp-born filigree.`,
    consequence: `The psyker temporarily loses 1 HP and gains it back at the beginning of its next activation.`,
  },
  {
    roll: 9,
    name: `Psychic Hiccup`,
    text: `A momentary warp jolt shifts the psyker 2" in a random direction, as if reality sneezes.`,
    consequence: `Moves 2" in a random direction`,
  },
  {
    roll: 10,
    name: `Reality Snap`,
    text: `Time fractures for the psyker—turn order of operatives is reshuffled.`,
    consequence: `Reshuffle the turn order at random.`,
  },
  {
    roll: 11,
    name: `Fluctuating Presence`,
    text: `Enemies struggle to perceive the psyker—appears blurred or doubled briefly.`,
    consequence: `Until their next activation, whenever the psyker is shot at, they may retain an additional dice as a save without rolling it.`,
  },
  {
    roll: 12,
    name: `Rotating Realities`,
    text: `Environmental features flicker between different terrain types or ages (e.g., ruin becomes pristine, or desert turns jungle).`,
    consequence: `Until the Psyker's next activation, they cannot benefit from cover.`,
  },
  {
    roll: 13,
    name: `Gravitic Lurch`,
    text: `The ground tilts—minor gravitational anomaly in 3" radius.`,
    consequence: `All operatives within 3" get -1" movement until the end of the psyker's next activation.`,
  },
  {
    roll: 14,
    name: `Veil Hiss`,
    text: `A faint shriek across dimensions only the psyker hears—makes them flinch.`,
    consequence: `The psyker loses 1 AP during their next activation`,
  },
  {
    roll: 15,
    name: `Vice Versa`,
    text: `With a warp-twisting blink, the operative swaps places with a random visible operative.`,
    consequence: `Switches Location with a random Operative with Line of Sight`,
  },
  {
    roll: 16,
    name: `Skin Shift`,
    text: `Flesh slightly distorts—muscles reconfigure into unsettling formations.`,
    consequence: `The psyker takes 1 damage. Until the end of the psyker's next activation, increase both damage characteristics of their melee weapons by 1.`,
  },
  {
    roll: 17,
    name: `Unreal Heat`,
    text: `Temperature around you surges unnaturally, metal begins to sweat.`,
    consequence: `Ranged weapons (except psychic or biological) of operatives within 3" jam.`,
  },
  {
    roll: 18,
    name: `Haunting Glance`,
    text: `The psyker's eyes emit dim glow—NPCs nearby feel unsettled.`,
    consequence: `Change the psyker's order to engaged. The psyker cannot switch to concealed until the end of their next activation.`,
  },
  {
    roll: 19,
    name: `Phantom Step`,
    text: `The psyker moves, but their body lags behind for a moment—like they're unstuck from reality.`,
    consequence: `Return the psyker's model to the place it started this activation.`,
  },
  {
    roll: 20,
    name: `Sanity Spill`,
    text: `Allies within line of sight must make a test to avoid gaining strange compulsions or temporary madness.`,
    consequence: `Allied Operatives must use a Dash Action on their next activation.`,
  },
  {
    roll: 21,
    name: `Warp Mark`,
    text: `A glowing sigil burns onto the psyker's skin, attracting unwanted warp attention or enemies with similar marks.`,
    consequence: `The operative becomes a priority target for all enemy operatives within 6".`,
  },
  {
    roll: 22,
    name: `Spoilage`,
    text: `A wave of rot pulses outward, instantly corrupting all medical supplies within 5".`,
    consequence: `All medical items within 5" spoil.`,
  },
  {
    roll: 23,
    name: `Soul Shear`,
    text: `Psyker visibly splits into two—only one is real; the other screams until gone.`,
    consequence: `Ghost image of the Psyker attracts all enemy Operatives within line of Sight and a Radius of 12".`,
  },
  {
    roll: 24,
    name: `Psychic Backlash`,
    text: `Energies surge into the psyker's mind, causing a great deal of pain.`,
    consequence: `The psyker takes damage equal to half the current peril gauge level, rounded up.`,
  },
  {
    roll: 25,
    name: `Sundering Bloom`,
    text: `A tear opens above—spilling light, voices, and unfamiliar wind. It blooms outward, and the warp exhales through her, flattening everything hostile nearby.`,
    consequence: `The psyker reduces her peril gauge by 2. A shockwave erupts around her: every enemy operative within 6" takes 6 damage and is pushed 2" away. Friendly operatives are unaffected.`,
  },
  {
    roll: 26,
    name: `Bleeding Light`,
    text: `Eyes leak photons—nearby allies experience mild visual distortion.`,
    consequence: `All friendly operatives within 3" must reroll a success until the end of the psyker's next activation.`,
  },
  {
    roll: 27,
    name: `Neural Overdrive`,
    text: `Psyker emits pulses of raw thought—nearby allies gain brief insight or confusion.`,
    consequence: `Friendly Operatives within 6" Roll 1d6. 1-3 and they lose 1 RC until the End of their next Activation. 4-6 they gain 1 RC until the End of their next Activation.`,
  },
  {
    roll: 28,
    name: `Echo of Eternity`,
    text: `A past memory not their own plays in the psyker's mind, altering their perception of time.`,
    consequence: `Time folds back on itself: the psyker may immediately repeat one action she took this activation, for free. A repeated psychic power still raises the peril gauge.`,
  },
  {
    roll: 29,
    name: `Tech Scorn`,
    text: `The warp twists local tech; guns jam, circuits fail, and cybernetics lash out at their hosts.`,
    consequence: `Technology within 5" malfunctions, ranged weapons jam and characters with cybernetic implants take 1d3 damage.`,
  },
  {
    roll: 30,
    name: `Daemon Spawn`,
    text: `Reality tears open and a daemonic entity spews forth.`,
    consequence: `A random daemonic entity appears at a point within 6" of the psyker.`,
  },
  {
    roll: 31,
    name: `Daemonic Incursion`,
    text: `Reality ripples and tears, multiple small rifts open and spew forth daemonic entities.`,
    consequence: `3 random daemonic entities spawn at points within 6" of the psyker.`,
  },
  {
    roll: 32,
    name: `Psychic Blast`,
    text: `A sudden psychic shockwave knocks back all nearby operatives 2", minds reeling.`,
    consequence: `Operatives within 3" of the Psyker get pushed away by 2"`,
  },
  {
    roll: 33,
    name: `The Warp Answers`,
    text: `For one impossible heartbeat the warp stops fighting her and simply obeys.`,
    consequence: `The psyker heals all wounds and her peril gauge drops to 0. Until the end of her next activation, her psychic actions cost 0 AP.`,
  },
  {
    roll: 34,
    name: `Breath Leech`,
    text: `The air is stripped of psychic life force, leaving lungs gasping for breath that no longer sustains.`,
    consequence: `All Operatives within 6" of the Psyker can not use Dash and Charge Actions until the End of the Psykers next Activation.`,
  },
  {
    roll: 35,
    name: `Blood Rain`,
    text: `Thick crimson rain soaks the battlefield, sapping agility from mortals until the psyker's next turn.`,
    consequence: `-1AP for all Operatives that dont have Demonic/Warp, until end of this operatives next activation.`,
  },
  {
    roll: 36,
    name: `Warp Static`,
    text: `Psyker hears interference in their mind—thoughts flicker but function remains.`,
    consequence: `Until the end of the Psyker's next activation, psychic actions cost +1 AP`,
  },
  {
    roll: 37,
    name: `Glass Veins`,
    text: `Skin briefly glistens like crystal before cracking harmlessly.`,
    consequence: `Until the beginning of their next activation, whenever the Psyker takes damage, increase that damage by 1.`,
  },
  {
    roll: 38,
    name: `Blood Boil`,
    text: `Psyker's aura causes enemies within a radius to feel their blood heat—suffering morale penalties or spontaneous aggression.`,
    consequence: `The closest enemy operative visible and within 6" of the psyker immediately attacks or charges the closest visible operative in range`,
  },
  {
    roll: 39,
    name: `Uncontrolled Channel`,
    text: `The psyker radiates warp energy uncontrollably—abilities surge out without activation, possibly hitting unintended targets.`,
    consequence: `All the psyker's abilities are activated, further increasing the peril gauge. If they require a target, the closest visible operative is chosen.`,
  },
  {
    roll: 40,
    name: `Mindfire Surge`,
    text: `A psychic surge lashes out at the nearest ally, an uncontrolled strike of mindfire.`,
    consequence: `Psychic Attack on the nearest friendly operative: 2 Attacks, Piercing 1, Hot, 3/4 DMG. Every crit reduces peril gauge by 1.`,
  },
  {
    roll: 41,
    name: `Sacrificial Demand`,
    text: `To continue channeling power, the warp demands a sacrifice: health, , or ally support.`,
    consequence: `The psyker cannot use any further psychic powers until they either use an action to pay 3hp or an ally within control range spends an action to end this effect.`,
  },
  {
    roll: 42,
    name: `Mental Drift`,
    text: `Psyker momentarily loses connection with reality—confuses friend and foe.`,
    consequence: `If a friendly operative is within LOS the Psyker attacks that operative.`,
  },
  {
    roll: 43,
    name: `Falling Upwards`,
    text: `Gravity reverses without warning, sending victims hurtling skyward until the warp surge ends and they come crashing back down.`,
    consequence: `All operatives within 2" rise 1d6 into the Air and take that much damage as they come crashing back down.`,
  },
  {
    roll: 44,
    name: `Summoner's Debt`,
    text: `A daemonic entity marks the psyker for future collection—a future session hook.`,
    consequence: `Something from the other side buries itself within the psykers mind.`,
  },
  {
    roll: 45,
    name: `Demonic Possession`,
    text: `The psyker's mind is overrun; a daemon takes control until the next activation.`,
    consequence: `Psyker loses control over it's operative until the End of his next Activation.`,
  },
  {
    roll: 46,
    name: `Eye of a God`,
    text: `A warp god glimpses the psyker, causing brief omniscient awareness—and consequences.`,
    consequence: `Rewind one full Turn of all Operatives. Enemies and Players alike.`,
  },
  {
    roll: 47,
    name: `Warp Breach`,
    text: `Reality tears open. Daemons spill forth until the rent in the world is sealed.`,
    consequence: `Demons spawn until the Breach is closed.`,
  },
  {
    roll: 48,
    name: `Catastrophic Warp Detonation`,
    text: ``,
    consequence: `Explodes in mind and matter—the blast tears a 12" hole in reality. Operatives in range suffer memory loss, stat reductions, and the terrain becomes warped permanently. Even survivors wonder if they still exist the way they did before.`,
  },
]

const PERILS_BY_ROLL: Map<number, Peril> = new Map(PERILS.map((p) => [p.roll, p]))

export function lookupPeril(total: number): Peril {
  const found = PERILS_BY_ROLL.get(total)
  if (!found) throw new Error(`No peril mapped to roll total ${total}`)
  return found
}
