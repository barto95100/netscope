import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

interface HttpResult {
  status_code?: number
  protocol?: string
  headers?: Record<string, string>
  security_headers?: {
    present: string[]
    missing: string[]
  }
  redirects?: Array<{ url: string; status: number }>
  [key: string]: unknown
}

export function HttpHeaders() {
  const [target, setTarget] = useState('')
  const [followRedirects, setFollowRedirects] = useState(true)
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('headers', target.trim(), { follow_redirects: followRedirects })
  }

  const result = scan?.result as HttpResult | null

  const statusColor = (code?: number) => {
    if (!code) return 'var(--color-text-secondary)'
    if (code < 300) return 'var(--color-green)'
    if (code < 400) return 'var(--color-accent)'
    if (code < 500) return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  return (
    <ToolPage
      title="HTTP Headers"
      description="Inspect HTTP response headers, security headers, and redirects"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        scan?.result && scan.status === 'completed' ? (
          <div className="space-y-4">
            {/* Status line */}
            {result?.status_code && (
              <div
                className="rounded-xl px-5 py-4 flex items-center gap-4"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <span
                  className="text-3xl font-bold"
                  style={{ color: statusColor(result.status_code), fontFamily: 'var(--font-family-heading)' }}
                >
                  {result.status_code}
                </span>
                {result.protocol && (
                  <span className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                    {result.protocol}
                  </span>
                )}
              </div>
            )}

            {/* Security headers */}
            {result?.security_headers && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                    Security Headers
                  </span>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.security_headers.present?.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                      <span style={{ color: 'var(--color-green)' }}>✓</span>
                      <span style={{ color: 'var(--color-text-primary)' }}>{h}</span>
                    </div>
                  ))}
                  {result.security_headers.missing?.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                      <span style={{ color: 'var(--color-red)' }}>×</span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Headers table */}
            {result?.headers && Object.keys(result.headers).length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                    Response Headers
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {Object.entries(result.headers).map(([k, v]) => (
                    <div key={k} className="px-4 py-2.5 flex gap-4 text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                      <span className="w-48 shrink-0 break-all" style={{ color: 'var(--color-accent)' }}>{k}</span>
                      <span className="break-all" style={{ color: 'var(--color-text-primary)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback raw */}
            {!result?.status_code && !result?.headers && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>Result</span>
                </div>
                <pre className="p-4 text-xs overflow-x-auto" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)', lineHeight: 1.6 }}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : scan?.status === 'failed' ? (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)', fontFamily: 'var(--font-family-mono)' }}>
            {scan.error ?? 'Scan failed'}
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label
            className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
          >
            URL
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. https://example.com"
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-family-mono)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="follow-redirects"
            checked={followRedirects}
            onChange={(e) => setFollowRedirects(e.target.checked)}
            className="w-4 h-4 rounded"
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <label htmlFor="follow-redirects" className="text-sm" style={{ color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            Follow redirects
          </label>
        </div>

        <div>
          <button
            type="submit"
            disabled={submitting || polling}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{
              background: 'linear-gradient(to right, var(--color-accent), #0284c7)',
              opacity: submitting || polling ? 0.6 : 1,
              fontFamily: 'var(--font-family-heading)',
            }}
          >
            {submitting ? 'Starting...' : polling ? 'Fetching...' : 'Inspect Headers'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
