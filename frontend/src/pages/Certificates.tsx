import { useEffect, useState, useCallback } from 'react'
import { api, type Scan } from '../api/client'

interface CertResult {
  target: string
  grade: string
  protocol: string
  cipher_suite: string
  certificates: {
    subject: string
    issuer: string
    not_before: string
    not_after: string
    dns_names: string[]
    is_expired: boolean
    days_left: number
    serial: string
    sig_algo: string
  }[]
  supported_protocols: string[]
  issues: string[]
}

interface WatchedCert {
  scanId: string
  target: string
  status: string
  result: CertResult | null
  checkedAt: string
}

export function Certificates() {
  const [watched, setWatched] = useState<WatchedCert[]>([])
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const scans = await api.scans.list({ type: 'ssl', limit: 50 })
      const unique = new Map<string, Scan>()
      for (const s of scans) {
        if (!unique.has(s.target)) unique.set(s.target, s)
      }
      const certs: WatchedCert[] = []
      for (const s of unique.values()) {
        certs.push({
          scanId: s.id,
          target: s.target,
          status: s.status,
          result: s.result as unknown as CertResult | null,
          checkedAt: s.completed_at || s.created_at,
        })
      }
      setWatched(certs)
    } catch {}
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    try {
      const s = await api.scans.create({ type: 'ssl', target })
      setTarget('')
      setShowForm(false)
      // Poll until done
      const poll = window.setInterval(async () => {
        const updated = await api.scans.get(s.id)
        if (updated.status === 'completed' || updated.status === 'failed') {
          window.clearInterval(poll)
          refresh()
        }
      }, 1500)
    } finally {
      setAdding(false)
    }
  }

  async function handleRescan(domain: string) {
    const s = await api.scans.create({ type: 'ssl', target: domain })
    const poll = window.setInterval(async () => {
      const updated = await api.scans.get(s.id)
      if (updated.status === 'completed' || updated.status === 'failed') {
        window.clearInterval(poll)
        refresh()
      }
    }, 1500)
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
            {watched.length} domain{watched.length !== 1 ? 's' : ''} tracked
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
            {adding ? 'Scanning...' : 'Scan & Add'}
          </button>
        </form>
      )}

      {watched.length === 0 && !showForm ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No certificates tracked yet</p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>Click "Add Domain" to start monitoring SSL certificates</p>
        </div>
      ) : (
        <div className="space-y-3">
          {watched.map((cert) => {
            const r = cert.result
            const mainCert = r?.certificates?.[0]
            return (
              <div key={cert.scanId} className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Grade */}
                  {r?.grade ? (
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${gradeColor(r.grade)}15`, border: `1px solid ${gradeColor(r.grade)}30` }}>
                      <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: gradeColor(r.grade) }}>
                        {r.grade}
                      </span>
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>...</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
                        {cert.target}
                      </span>
                      {mainCert?.is_expired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--color-red)' }}>EXPIRED</span>
                      )}
                    </div>
                    {mainCert && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          Issuer: {mainCert.issuer}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          CN: {mainCert.subject}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Days left */}
                  {mainCert && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: daysColor(mainCert.days_left) }}>
                        {mainCert.days_left}d
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>remaining</div>
                    </div>
                  )}

                  {/* Protocol */}
                  {r?.protocol && (
                    <span className="text-xs px-2 py-1 rounded shrink-0" style={{ fontFamily: 'var(--font-family-mono)', background: 'rgba(14,165,233,0.08)', color: 'var(--color-accent)' }}>
                      {r.protocol}
                    </span>
                  )}

                  {/* Rescan */}
                  <button onClick={() => handleRescan(cert.target)} className="px-2 py-1 rounded text-xs shrink-0"
                    style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }} title="Rescan">
                    ↻
                  </button>
                </div>

                {/* Issues */}
                {r?.issues && r.issues.length > 0 && (
                  <div className="px-5 pb-4 pt-0">
                    <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                      {r.issues.map((issue, i) => (
                        <p key={i} className="text-xs py-0.5" style={{ color: 'var(--color-red)' }}>{issue}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* DNS names */}
                {mainCert?.dns_names && mainCert.dns_names.length > 0 && (
                  <div className="px-5 pb-4 pt-0">
                    <div className="flex flex-wrap gap-1.5">
                      {mainCert.dns_names.slice(0, 8).map((dns, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded"
                          style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
                          {dns}
                        </span>
                      ))}
                      {mainCert.dns_names.length > 8 && (
                        <span className="text-[10px] px-2 py-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                          +{mainCert.dns_names.length - 8} more
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
