import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

interface CertInfo {
  subject?: string
  issuer?: string
  not_before?: string
  not_after?: string
  san?: string[]
}

interface SslResult {
  grade?: string
  protocol?: string
  cipher?: string
  certificates?: CertInfo[]
  issues?: string[]
  [key: string]: unknown
}

const gradeColors: Record<string, string> = {
  A: 'var(--color-green)',
  B: 'var(--color-green)',
  C: 'var(--color-yellow)',
  D: 'var(--color-yellow)',
  E: 'var(--color-red)',
  F: 'var(--color-red)',
  T: 'var(--color-red)',
  M: 'var(--color-red)',
}

export function SslAudit() {
  const [target, setTarget] = useState('')
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('ssl', target.trim())
  }

  const result = scan?.result as SslResult | null

  return (
    <ToolPage
      title="SSL/TLS Audit"
      description="Analyze SSL/TLS configuration, certificate validity, and security grade"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        scan?.result && scan.status === 'completed' ? (
          <div className="space-y-4">
            {/* Grade + summary */}
            <div
              className="rounded-xl p-5 flex items-center gap-6"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              {result?.grade && (
                <div
                  className="text-6xl font-bold w-20 h-20 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    color: gradeColors[result.grade] ?? 'var(--color-text-secondary)',
                    background: `${gradeColors[result.grade] ?? 'var(--color-text-secondary)'}15`,
                    fontFamily: 'var(--font-family-heading)',
                    border: `2px solid ${gradeColors[result.grade] ?? 'var(--color-border)'}40`,
                  }}
                >
                  {result.grade}
                </div>
              )}
              <div className="flex-1">
                {result?.protocol && (
                  <div className="mb-1">
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Protocol: </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
                      {result.protocol}
                    </span>
                  </div>
                )}
                {result?.cipher && (
                  <div>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Cipher: </span>
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                      {result.cipher}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Certificates */}
            {result?.certificates && result.certificates.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                    Certificates
                  </span>
                </div>
                {result.certificates.map((cert, i) => (
                  <div key={i} className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {cert.subject && <div className="text-sm mb-1" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>{cert.subject}</div>}
                    {cert.issuer && <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Issuer: {cert.issuer}</div>}
                    {cert.not_after && <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Expires: {cert.not_after}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Issues */}
            {result?.issues && result.issues.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-red)', fontFamily: 'var(--font-family-heading)' }}>
                    Issues
                  </span>
                </div>
                {result.issues.map((issue, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ color: 'var(--color-red)' }}>×</span>
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{issue}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Raw if no structured data */}
            {!result?.grade && (
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
            Target Domain
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. example.com or https://example.com"
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
            {submitting ? 'Starting...' : polling ? 'Auditing...' : 'Run SSL Audit'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
