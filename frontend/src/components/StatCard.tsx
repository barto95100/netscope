type StatColor = 'green' | 'blue' | 'yellow' | 'red'

interface StatCardProps {
  label: string
  value: number
  sub: string
  color: StatColor
}

const colorMap: Record<StatColor, string> = {
  green: 'var(--color-green)',
  blue: 'var(--color-accent)',
  yellow: 'var(--color-yellow)',
  red: 'var(--color-red)',
}

export function StatCard({ label, value, sub, color }: StatCardProps) {
  const accent = colorMap[color]

  return (
    <div
      className="rounded-xl overflow-hidden relative"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Accent bar on top */}
      <div
        className="h-0.5 w-full"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />

      <div className="p-5">
        <div
          className="text-xs font-medium uppercase tracking-widest mb-3"
          style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
        >
          {label}
        </div>

        <div
          className="text-4xl font-bold mb-1"
          style={{ color: accent, fontFamily: 'var(--font-family-heading)' }}
        >
          {value.toLocaleString()}
        </div>

        <div
          className="text-xs"
          style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}
        >
          {sub}
        </div>
      </div>
    </div>
  )
}
