import type { ReactNode } from 'react'
import type { Scan } from '../api/client'

interface ToolPageProps {
  title: string
  description?: string
  children: ReactNode
  scan?: Scan | null
  polling?: boolean
  submitting?: boolean
  error?: string | null
  result?: ReactNode
}

export function ToolPage({ title, description, children, scan, polling, submitting, error, result }: ToolPageProps) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {description}
          </p>
        )}
      </div>

      {/* Form card */}
      <div
        className="rounded-xl p-5 mb-5"
        style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
      >
        {children}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg px-4 py-3 mb-4 text-sm"
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: 'var(--color-red)',
            fontFamily: 'var(--font-family-mono)',
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Status bar */}
      {scan && (
        <div
          className="rounded-lg px-4 py-2.5 mb-4 flex items-center gap-3 text-sm"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
        >
          {polling && (
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--color-accent)' }}
            />
          )}
          <span style={{ color: 'var(--color-text-secondary)' }}>
            Status:{' '}
            <span
              style={{
                color:
                  scan.status === 'completed'
                    ? 'var(--color-green)'
                    : scan.status === 'failed'
                      ? 'var(--color-red)'
                      : 'var(--color-accent)',
                fontFamily: 'var(--font-family-mono)',
              }}
            >
              {scan.status}
            </span>
          </span>
          {submitting && (
            <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)', fontSize: '0.7rem' }}>
              Creating scan...
            </span>
          )}
        </div>
      )}

      {/* Result */}
      {result}
    </div>
  )
}
