import { useState } from 'react'
import { api, type Scan } from '../api/client'

export function VulnScanner() {
  const [target, setTarget] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
        Vulnerability Scanner
      </h1>
      <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target IP or domain"
          className="flex-1 px-4 py-2.5 rounded-lg text-sm"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        <button type="submit" disabled={loading || !target} className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </form>
      {scan && (
        <div className="rounded-xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-medium" style={{ color: scan.status === 'completed' ? 'var(--color-green)' : scan.status === 'running' ? 'var(--color-accent)' : 'var(--color-red)' }}>{scan.status}</span>
            <span className="text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>{scan.target}</span>
          </div>
          {scan.result && (
            <pre className="text-xs overflow-x-auto rounded-lg p-4" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface)' }}>
              {JSON.stringify(scan.result, null, 2)}
            </pre>
          )}
          {scan.error && <p className="text-sm mt-2" style={{ color: 'var(--color-red)' }}>{scan.error}</p>}
        </div>
      )}
    </div>
  )
}
