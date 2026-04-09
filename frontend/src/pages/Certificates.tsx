import { useEffect, useState, useCallback } from 'react'
import { api, type Monitor } from '../api/client'

interface CertCheckResult {
  grade?: string
  protocol?: string
  cipher_suite?: string
  certificates?: {
    subject: string
    issuer: string
    not_after: string
    dns_names: string[]
    is_expired: boolean
    days_left: number
  }[]
  issues?: string[]
}

export function Certificates() {
  const [monitors, setMonitors] = useState<(Monitor & { certResult?: CertCheckResult })[]>([])
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const all = await api.monitors.list()
      // Only show ssl_expiry monitors
      const sslMonitors = all.filter((m: Monitor) => m.type === 'ssl_expiry')

      // For each monitor, fetch latest SSL scan result if available
      const enriched = await Promise.all(sslMonitors.map(async (m: Monitor) => {
        try {
          const scans = await api.scans.list({ type: 'ssl', limit: 1 })
          const match = scans.find((s) => s.target === m.target && s.status === 'completed')
          return { ...m, certResult: match?.result as unknown as CertCheckResult | undefined }
        } catch {
          return { ...m }
        }
      }))
      setMonitors(enriched)
    } catch {}
  }, [])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 15000)
    return () => window.clearInterval(id)
  }, [refresh])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    try {
      // Create an ssl_expiry monitor
      await api.monitors.create({ name: `SSL: ${target}`, type: 'ssl_expiry', target, interval_sec: 3600 })
      // Also run an immediate SSL scan for instant results
      await api.scans.create({ type: 'ssl', target })
      setTarget('')
      setShowForm(false)
      // Wait a bit for scan to complete then refresh
      setTimeout(refresh, 3000)
    } finally {
      setAdding(false)
    }
  }

  async function handleRescan(domain: string) {
    await api.scans.create({ type: 'ssl', target: domain })
    setTimeout(refresh, 3000)
  }

  async function handleDelete(id: string) {
    await api.monitors.delete(id)
    refresh()
  }

  function gradeColor(grade: string) {
    if (grade === 'A') return 'var(--color-green)'
    if (grade === 'B') return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  function daysColor(days: number) {
    if (days <= 7) return 'var(--color-red)'
    if (days <= 30) return 'var(--color-yellow)'
    return 'var(--color-green)'
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
            Certificate Monitoring
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {monitors.length} domain{monitors.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
          + Add Domain
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl p-5 mb-6 flex gap-3 items-end" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Domain</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. example.com" required
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
          </div>
          <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <button type="submit" disabled={adding || !target} className="px-6 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
            {adding ? 'Adding...' : 'Add & Scan'}
          </button>
        </form>
      )}

      {monitors.length === 0 && !showForm ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No certificates tracked yet</p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>Click "Add Domain" to start monitoring SSL certificates</p>
        </div>
      ) : (
        <div className="space-y-3">
          {monitors.map((m) => {
            const cert = m.certResult?.certificates?.[0]
            const grade = m.certResult?.grade
            return (
              <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Status dot */}
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{
                    background: m.last_status === 'up' ? 'var(--color-green)' : m.last_status === 'down' ? 'var(--color-red)' : 'var(--color-yellow)',
                    boxShadow: m.last_status === 'up' ? '0 0 6px var(--color-green)' : m.last_status === 'down' ? '0 0 6px var(--color-red)' : 'none'
                  }} />

                  {/* Grade */}
                  {grade ? (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${gradeColor(grade)}15`, border: `1px solid ${gradeColor(grade)}30` }}>
                      <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: gradeColor(grade) }}>
                        {grade}
                      </span>
                    </div>
                  ) : null}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
                        {m.target}
                      </span>
                      {cert?.is_expired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--color-red)' }}>EXPIRED</span>
                      )}
                    </div>
                    {cert && (
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {cert.issuer} &middot; {cert.subject}
                      </span>
                    )}
                  </div>

                  {/* Days left */}
                  {cert && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: daysColor(cert.days_left) }}>
                        {cert.days_left}d
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>remaining</div>
                    </div>
                  )}

                  {/* Interval */}
                  <span className="text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                    every {m.interval_sec >= 3600 ? `${m.interval_sec / 3600}h` : `${m.interval_sec / 60}m`}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-1">
                    <button onClick={() => handleRescan(m.target)} className="px-2 py-1 rounded text-xs"
                      style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }} title="Rescan">↻</button>
                    <button onClick={() => handleDelete(m.id)} className="px-2 py-1 rounded text-xs"
                      style={{ color: 'var(--color-red)', border: '1px solid rgba(239,68,68,0.2)' }} title="Remove">✕</button>
                  </div>
                </div>

                {/* Issues */}
                {m.certResult?.issues && m.certResult.issues.length > 0 && (
                  <div className="px-5 pb-4 pt-0">
                    <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                      {m.certResult.issues.map((issue, i) => (
                        <p key={i} className="text-xs py-0.5" style={{ color: 'var(--color-red)' }}>{issue}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* DNS names */}
                {cert?.dns_names && cert.dns_names.length > 0 && (
                  <div className="px-5 pb-4 pt-0">
                    <div className="flex flex-wrap gap-1.5">
                      {cert.dns_names.slice(0, 6).map((dns, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded"
                          style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
                          {dns}
                        </span>
                      ))}
                      {cert.dns_names.length > 6 && (
                        <span className="text-[10px] px-2 py-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                          +{cert.dns_names.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
