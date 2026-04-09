import { useState } from 'react'
import { api, type Scan } from '../api/client'

interface VulnFinding {
  severity: string
  category: string
  title: string
  description: string
  remediation?: string
}

interface VulnResult {
  target: string
  grade: string
  summary: { critical: number; high: number; medium: number; low: number; info: number; total: number }
  findings: VulnFinding[]
}

const sevColor: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#0ea5e9',
  info: '#7a8ba8',
}

const sevBg: Record<string, string> = {
  critical: 'rgba(239,68,68,0.1)',
  high: 'rgba(249,115,22,0.1)',
  medium: 'rgba(234,179,8,0.1)',
  low: 'rgba(14,165,233,0.1)',
  info: 'rgba(122,139,168,0.1)',
}

const gradeColor: Record<string, string> = {
  A: '#10b981', B: '#10b981', C: '#eab308', D: '#f97316', F: '#ef4444',
}

export function VulnScanner() {
  const [target, setTarget] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setScan(null)
    try {
      const s = await api.scans.create({ type: 'vulnscan', target })
      setScan(s)
      const poll = setInterval(async () => {
        const updated = await api.scans.get(s.id)
        setScan(updated)
        if (updated.status === 'completed' || updated.status === 'failed') clearInterval(poll)
      }, 2000)
    } finally {
      setLoading(false)
    }
  }

  const result = scan?.result as unknown as VulnResult | null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
          Vulnerability Scanner
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Composite scan: port scan + SSL/TLS audit + HTTP security headers
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <input value={target} onChange={(e) => setTarget(e.target.value)}
          placeholder="Target domain or IP (e.g. example.com)"
          className="flex-1 px-4 py-2.5 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }} />
        <button type="submit" disabled={loading || !target || scan?.status === 'running' || scan?.status === 'pending'}
          className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
          {scan?.status === 'running' || scan?.status === 'pending' ? 'Scanning...' : 'Scan'}
        </button>
      </form>

      {(scan?.status === 'running' || scan?.status === 'pending') && (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-center gap-3">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
            <span className="text-sm" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
              Running vulnerability scan on {scan.target}...
            </span>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
            This may take 30-60 seconds (port scan + SSL + headers)
          </p>
        </div>
      )}

      {scan?.status === 'failed' && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)' }}>
          {scan.error ?? 'Scan failed'}
        </div>
      )}

      {result && scan?.status === 'completed' && (
        <div className="space-y-4">
          {/* Grade + Summary */}
          <div className="rounded-xl p-5 flex items-center gap-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0" style={{
              background: `${gradeColor[result.grade] || '#7a8ba8'}15`,
              border: `2px solid ${gradeColor[result.grade] || '#7a8ba8'}40`,
            }}>
              <span className="text-5xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: gradeColor[result.grade] }}>
                {result.grade}
              </span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
                {result.target}
              </div>
              <div className="flex gap-3">
                {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
                  const count = result.summary[sev as keyof typeof result.summary] as number
                  if (count === 0) return null
                  return (
                    <div key={sev} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: sevBg[sev] }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: sevColor[sev] }} />
                      <span className="text-xs font-medium" style={{ color: sevColor[sev], fontFamily: 'var(--font-family-mono)' }}>
                        {count} {sev}
                      </span>
                    </div>
                  )
                })}
                {result.summary.total === 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-green)' }}>No vulnerabilities found</span>
                )}
              </div>
            </div>
          </div>

          {/* Findings */}
          {result.findings.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                  Findings ({result.findings.length})
                </span>
              </div>
              {result.findings.map((f, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase shrink-0 mt-0.5" style={{
                    background: sevBg[f.severity],
                    color: sevColor[f.severity],
                    fontFamily: 'var(--font-family-mono)',
                  }}>
                    {f.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{f.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{f.description}</div>
                    {f.remediation && (
                      <div className="text-xs mt-1" style={{ color: 'var(--color-accent)' }}>Fix: {f.remediation}</div>
                    )}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{
                    background: 'rgba(14,165,233,0.05)',
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-family-mono)',
                  }}>
                    {f.category}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
