import type { Scan } from '../api/client'

interface ScanRowProps {
  scan: Scan
}

const scanTypeColors: Record<string, string> = {
  ping: 'var(--color-green)',
  port_scan: 'var(--color-accent)',
  traceroute: 'var(--color-accent)',
  dns: 'var(--color-yellow)',
  whois: 'var(--color-yellow)',
  ssl: 'var(--color-green)',
  http_headers: 'var(--color-accent)',
  vuln_scan: 'var(--color-red)',
}

const statusColors: Record<string, string> = {
  pending: 'var(--color-text-secondary)',
  running: 'var(--color-accent)',
  completed: 'var(--color-green)',
  failed: 'var(--color-red)',
  cancelled: 'var(--color-text-tertiary)',
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export function ScanRow({ scan }: ScanRowProps) {
  const typeColor = scanTypeColors[scan.type] ?? 'var(--color-text-secondary)'
  const statusColor = statusColors[scan.status] ?? 'var(--color-text-secondary)'

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 rounded-lg transition-colors"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {/* Type badge */}
      <span
        className="text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wide shrink-0"
        style={{
          color: typeColor,
          background: `${typeColor}18`,
          fontFamily: 'var(--font-family-mono)',
          border: `1px solid ${typeColor}30`,
        }}
      >
        {scan.type.replace('_', ' ')}
      </span>

      {/* Target */}
      <span
        className="flex-1 text-sm truncate"
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}
      >
        {scan.target}
      </span>

      {/* Status */}
      <span
        className="text-xs font-medium shrink-0"
        style={{ color: statusColor }}
      >
        {scan.status}
      </span>

      {/* Time */}
      <span
        className="text-xs shrink-0 w-16 text-right"
        style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}
      >
        {timeAgo(scan.created_at)}
      </span>
    </div>
  )
}
