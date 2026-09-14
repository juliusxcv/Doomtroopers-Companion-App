export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <div className="panel flex p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex-1 py-2 font-mono text-xs font-medium tracking-widest uppercase transition-colors ${
            value === t.key ? 'bg-phosphor-faint text-glow text-phosphor' : 'text-bone-dim hover:text-bone'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
