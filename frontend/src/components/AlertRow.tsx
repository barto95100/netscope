import type { Alert } from '../api/client'

interface AlertRowProps {
  alert: Alert
}

const severityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: 'CRIT', color: 'var(--color-red)' },
  high: { label: 'HIGH', color: 'var(--color-red)' },
  warning: { label: 'WARN', color: 'var(--color-yellow)' },
  medium: { label: 'WARN', color: 'var(--color-yellow)' },
  info: { label: 'INFO', color: 'var(--color-accent)' },
  low: { label: 'LOW', color: 'var(--color-green)' },
}

export function AlertRow({ alert }: AlertRowProps) {
  const sev = severityConfig[alert.severity.toLowerCase()] ?? {
    label: alert.severity.toUpperCase().slice(0, 4),
    color: 'var(--color-text-secondary)',
  }

  return (
    <div
      className="flex items-start gap-3 px-4 py-3"
      style={{
        borderBottom: '1px solid var(--color-border)',
        borderLeft: `3px solid ${sev.color}`,
      }}
    >
      {/* Severity badge */}
      <span
        className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 shrink-0"
        style={{
          color: sev.color,
          background: `${sev.color}18`,
          fontFamily: 'var(--font-family-mono)',
        }}
      >
        {sev.label}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {alert.title}
        </div>
        {alert.message && (
          <div
            className="text-xs mt-0.5 truncate"
            style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}
          >
            {alert.message}
          </div>
        )}
      </div>

      {/* Status */}
      <span
        className="text-xs shrink-0"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {alert.status}
      </span>
    </div>
  )
}
