import { useState } from 'react'
import { RARITIES, RARITY_BORDER, RARITY_GLYPH, RARITY_TEXT } from '../lib/rarity'
import { ScanTierBar } from './Autopsy'
import { AbilitiesList, StatGrid, WeaponTable, type Ability, type Stats, type Weapon } from './StatBlock'

// Living reference for the Cogitator terminal design system — every color
// token, type scale, and reusable UI pattern this app actually uses, in one
// place. Not part of the player-facing app (no MainMenu tile, no session
// needed) — reached via the #styleguide hash, checked in App.tsx before the
// Lobby/SessionShell branch, so it needs zero routing/hosting config and
// works identically in dev and on Vercel's static hosting.
//
// Sections mostly reuse the SAME classes/components the real screens use
// (StatGrid/WeaponTable/AbilitiesList/ScanTierBar are imported live, rarity
// colors come straight from src/lib/rarity.ts) rather than re-describing
// them, so this stays accurate as the app evolves instead of drifting into
// its own parallel design language.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
        ++ {title} ++
      </h2>
      {children}
    </section>
  )
}

function Swatch({ name, varName, className }: { name: string; varName: string; className: string }) {
  return (
    <div className="panel p-2 text-center">
      <div className={`mb-2 h-12 w-full border border-phosphor-faint ${className}`} />
      <div className="font-mono text-xs text-bone">{name}</div>
      <div className="font-mono text-[10px] text-bone-dim">{varName}</div>
    </div>
  )
}

const SAMPLE_STATS: Stats = { rc: '4+', cc: '4+', ap: '3+', mv: '6"', def: '4+', hp: '2', inv: '5+' }
const SAMPLE_WEAPONS: Weapon[] = [{ name: 'Lasgun', atk: '2', dmg: '1d6', wr: '18"' }]
const SAMPLE_ABILITIES: Ability[] = [
  { name: 'Steady Aim', description: 'Re-roll a single failed RC test once per turn.' },
  { name: 'Machine Empathy', description: 'Treats servitors and cogitators as allies for targeting purposes.' },
]

export function StyleGuide() {
  const [rarityDemo, setRarityDemo] = useState<(typeof RARITIES)[number]>('rare')
  const [inputValue, setInputValue] = useState('')
  const [selectValue, setSelectValue] = useState('acolyte')
  const [tab, setTab] = useState<'left' | 'right'>('left')

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-6">
      <div className="text-center">
        <p className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim">++ COGITATOR LINK ++</p>
        <h1 className="text-glow font-display text-3xl leading-tight text-phosphor">Style Guide</h1>
        <p className="mt-1 font-mono text-xs text-bone-dim">Every color, type scale, and UI pattern in one place.</p>
      </div>

      <Section title="Typography">
        <div className="panel space-y-3 p-3">
          <div>
            <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">font-display (Cinzel) · headings</div>
            <div className="text-glow font-display text-3xl text-phosphor">Doomtroopers</div>
            <div className="text-glow font-display text-xl text-phosphor">Autopsy Report</div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">font-mono (JetBrains Mono) · UI chrome</div>
            <div className="font-mono text-sm text-bone">Regular UI text — buttons, labels, data.</div>
            <div className="font-mono text-[11px] tracking-widest text-phosphor-dim uppercase">Tracked uppercase label</div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-widest text-phosphor-dim uppercase">font-body (Spectral) · long-form prose</div>
            <p className="font-body text-sm text-bone-dim">
              Reserved for Codex lore paragraphs — a serif built for reading, not glowing chrome. Glow and
              saturated phosphor are for headings and UI, never body copy.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Color Tokens">
        <div className="grid grid-cols-3 gap-2">
          <Swatch name="phosphor" varName="--color-phosphor" className="bg-phosphor" />
          <Swatch name="phosphor-dim" varName="--color-phosphor-dim" className="bg-phosphor-dim" />
          <Swatch name="phosphor-faint" varName="--color-phosphor-faint" className="bg-phosphor-faint" />
          <Swatch name="bone" varName="--color-bone" className="bg-bone" />
          <Swatch name="bone-dim" varName="--color-bone-dim" className="bg-bone-dim" />
          <Swatch name="brass" varName="--color-brass" className="bg-brass" />
          <Swatch name="sanguine" varName="--color-sanguine" className="bg-sanguine" />
          <Swatch name="panel" varName="--color-panel" className="bg-panel" />
          <Swatch name="panel-raised" varName="--color-panel-raised" className="bg-panel-raised" />
        </div>
        <p className="font-mono text-[10px] text-bone-dim">
          <span className="text-glow text-phosphor">text-glow</span> utility — phosphor text with a soft dual-layer
          glow, reserved for headings/big numerals, never paragraph text.
        </p>
      </Section>

      <Section title="Rarity Tokens">
        <div className="grid grid-cols-5 gap-1">
          {RARITIES.map((r) => {
            const active = rarityDemo === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRarityDemo(r)}
                className={`border py-1.5 text-center transition-opacity ${RARITY_BORDER[r]} ${RARITY_TEXT[r]} ${
                  active ? 'bg-panel-raised' : 'opacity-40'
                }`}
              >
                <div className="text-base leading-none">{RARITY_GLYPH[r]}</div>
                <div className="font-mono text-[8px] tracking-widest uppercase">{r}</div>
              </button>
            )
          })}
        </div>
        <div className={`flex items-center gap-2 border px-2 py-1.5 ${RARITY_BORDER[rarityDemo]}`}>
          <span className={`w-4 text-center text-base leading-none ${RARITY_TEXT[rarityDemo]}`}>{RARITY_GLYPH[rarityDemo]}</span>
          <span className={`font-mono text-sm ${RARITY_TEXT[rarityDemo]}`}>Sample inventory row — {rarityDemo}</span>
        </div>
      </Section>

      <Section title="Panels">
        <div className="grid grid-cols-2 gap-2">
          <div className="panel p-3">
            <div className="font-mono text-[10px] tracking-widest text-phosphor-dim uppercase">.panel</div>
            <p className="mt-1 font-mono text-xs text-bone-dim">Default card/list-row surface.</p>
          </div>
          <div className="panel-raised p-3">
            <div className="font-mono text-[10px] tracking-widest text-phosphor-dim uppercase">.panel-raised</div>
            <p className="mt-1 font-mono text-xs text-bone-dim">Nested/expanded detail surface.</p>
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="space-y-2">
          <button type="button" className="w-full border border-phosphor bg-phosphor-faint py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase transition hover:bg-phosphor/20">
            Primary Action
          </button>
          <button type="button" disabled className="w-full border border-phosphor bg-phosphor-faint py-2 font-mono text-xs font-semibold tracking-widest text-phosphor uppercase opacity-40 disabled:cursor-not-allowed">
            Primary (disabled)
          </button>
          <button type="button" className="w-full border border-phosphor-dim px-2 py-1.5 font-mono text-[11px] font-medium tracking-widest text-bone uppercase hover:border-phosphor">
            Secondary / Nav
          </button>
          <button type="button" className="w-full border border-sanguine py-2 text-center font-mono text-xs tracking-widest text-sanguine uppercase hover:bg-sanguine/10">
            Destructive
          </button>
          <div className="panel flex p-1">
            {(['left', 'right'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2 font-mono text-xs font-medium tracking-widest uppercase transition-colors ${
                  tab === t ? 'bg-phosphor-faint text-glow text-phosphor' : 'text-bone-dim hover:text-bone'
                }`}
              >
                Tab {t}
              </button>
            ))}
          </div>
          <span className="inline-block border border-brass px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-brass uppercase">
            GM badge
          </span>
        </div>
      </Section>

      <Section title="Form Inputs">
        <div className="space-y-3">
          <label className="block font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
            Text input
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g. K7QX9"
              className="panel mt-1 w-full px-3 py-2 font-mono text-sm text-bone outline-none focus:border-phosphor"
            />
          </label>
          <label className="block font-mono text-[11px] font-medium tracking-widest text-phosphor-dim uppercase">
            Select
            <select
              value={selectValue}
              onChange={(e) => setSelectValue(e.target.value)}
              className="panel mt-1 w-full px-3 py-2 font-mono text-sm text-bone outline-none focus:border-phosphor"
            >
              <option value="acolyte">Lvl-I</option>
              <option value="techpriest">Lvl-II</option>
              <option value="magos">Lvl-III</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Stat Block">
        <div className="panel space-y-3 p-3">
          <StatGrid stats={SAMPLE_STATS} />
          <WeaponTable label="Ranged" weapons={SAMPLE_WEAPONS} />
        </div>
        <AbilitiesList abilities={SAMPLE_ABILITIES} />
      </Section>

      <Section title="Scan Progress">
        <ScanTierBar scanCount={7} thresholds={[5, 15, 45, 120]} unlocked={1} total={4} />
      </Section>

      <Section title="Celebration Banner">
        <div className="animate-tier-unlock animate-tier-glow animate-tier-shine border border-phosphor bg-phosphor-faint px-3 py-2 text-center">
          <p className="text-glow font-display text-lg text-phosphor">Dossier Tier 2 Unlocked</p>
        </div>
      </Section>

      <Section title="Menu Tile">
        <button type="button" className="panel flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:border-phosphor">
          <span className="text-glow font-display text-3xl text-phosphor">☉</span>
          <span className="flex-1">
            <span className="text-glow block font-display text-xl text-phosphor">Feature Name</span>
            <span className="block font-mono text-xs text-bone-dim">One-line description of what it does.</span>
          </span>
          <span className="font-mono text-phosphor-dim">›</span>
        </button>
      </Section>

      <Section title="Modal Surface">
        <div className="panel-raised w-full max-w-sm p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.3em] text-phosphor-dim uppercase">++ Modal Title ++</span>
            <button type="button" className="font-mono text-sm text-bone-dim hover:text-bone">✕</button>
          </div>
          <p className="font-mono text-xs text-bone-dim">Modals sit on a fixed inset-0 bg-black/70 backdrop, click-outside to close.</p>
        </div>
      </Section>

      <Section title="Lock / Cost Badge (Codex)">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="flex-1 truncate text-left font-body text-bone-dim/60">
              <span className="mr-1">🔒</span>Locked Entry
            </span>
            <span className="shrink-0 border border-phosphor-dim px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest text-bone uppercase">
              Unlock · 30 pts
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="flex-1 truncate text-left font-body text-bone-dim/60">
              <span className="mr-1">🔒</span>Unaffordable Entry
            </span>
            <span className="shrink-0 border border-sanguine/60 px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest text-sanguine uppercase">
              Unlock · 250 pts
            </span>
          </div>
        </div>
      </Section>
    </div>
  )
}
