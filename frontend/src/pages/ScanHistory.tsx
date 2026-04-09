import { useEffect, useState } from 'react'
import { api, type Scan } from '../api/client'
import { ScanRow } from '../components/ScanRow'

export function ScanHistory() {
  const [scans, setScans] = useState<Scan[]>([])
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    const params: Record<string, string> = { limit: '50' }
    if (typeFilter) params.type = typeFilter
    api.scans.list(params).then(setScans).catch(() => {})
  }, [typeFilter])

  const types = ['', 'ping', 'dns', 'whois', 'traceroute', 'mtr', 'portscan', 'ssl', 'headers', 'vulnscan']

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
          Scan History
        </h1>
        <div className="flex gap-2 flex-wrap">
          {types.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: typeFilter === t ? 'rgba(14,165,233,0.1)' : 'transparent', color: typeFilter === t ? 'var(--color-accent)' : 'var(--color-text-tertiary)', border: `1px solid ${typeFilter === t ? 'rgba(14,165,233,0.2)' : 'var(--color-border)'}` }}>
              {t || 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        {scans.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No scans found</div>
        ) : (
          scans.map((scan) => <ScanRow key={scan.id} scan={scan} />)
        )}
      </div>
    </div>
  )
}
