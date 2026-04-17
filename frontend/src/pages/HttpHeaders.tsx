import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'
import { usePrivacy } from '../hooks/usePrivacy'

interface HeaderCheck {
  name: string
  value: string
  present: boolean
  rating: string
  note: string
}

interface HeadersResult {
  target: string
  grade: string
  score: number
  headers: HeaderCheck[]
}

export function HttpHeaders() {
  const { maskIp } = usePrivacy()
  const [target, setTarget] = useState('')
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('headers', target.trim())
  }

  const result = scan?.result as unknown as HeadersResult | null

  function gradeColor(grade: string) {
    if (grade === 'A') return 'var(--color-green)'
    if (grade === 'B') return 'var(--color-green)'
    if (grade === 'C') return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  function ratingIcon(rating: string) {
    if (rating === 'good') return { icon: '✓', color: 'var(--color-green)' }
    if (rating === 'ok') return { icon: '~', color: 'var(--color-accent)' }
    if (rating === 'weak') return { icon: '!', color: 'var(--color-yellow)' }
    if (rating === 'missing') return { icon: '✗', color: 'var(--color-red)' }
    return { icon: '?', color: 'var(--color-text-tertiary)' }
  }

  return (
    <ToolPage
      title="HTTP Headers"
      description="Inspect HTTP security headers and get a security grade"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        result && scan?.status === 'completed' ? (
          <div className="space-y-4">
            {/* Grade */}
            <div className="rounded-xl px-5 py-4 flex items-center gap-4"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <span className="text-4xl font-bold"
                style={{ color: gradeColor(result.grade), fontFamily: 'var(--font-family-heading)' }}>
                {result.grade}
              </span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{maskIp(result.target)}</p>
                <p className="text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                  Score: {result.score}/100
                </p>
              </div>
            </div>

            {/* Headers table */}
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                  Security Headers
                </span>
              </div>
              <div>
                {result.headers?.map((h) => {
                  const r = ratingIcon(h.rating)
                  return (
                    <div key={h.name} className="px-4 py-3 flex items-start gap-3"
                      style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="text-sm mt-0.5 shrink-0" style={{ color: r.color }}>{r.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-primary)' }}>
                            {h.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                            background: `${r.color}15`,
                            color: r.color,
                            fontFamily: 'var(--font-family-mono)'
                          }}>{h.rating}</span>
                        </div>
                        {h.value && (
                          <p className="text-xs mt-1 break-all" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}>
                            {h.value}
                          </p>
                        )}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{h.note}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : scan?.status === 'failed' ? (
          <div className="rounded-lg px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)' }}>
            {scan.error ?? 'Scan failed'}
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
            Domain
          </label>
          <input type="text" value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. example.com" required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }} />
        </div>
        <button type="submit" disabled={submitting || polling}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
          style={{ background: 'linear-gradient(to right, var(--color-accent), #0284c7)', opacity: submitting || polling ? 0.6 : 1 }}>
          {submitting ? 'Starting...' : polling ? 'Checking...' : 'Inspect Headers'}
        </button>
      </form>
    </ToolPage>
  )
}
