import { useEffect, useState } from 'react'
import { api, type Alert } from '../api/client'
import { AlertRow } from '../components/AlertRow'

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    const params = filter ? { status: filter } : undefined
    api.alerts.list(params).then(setAlerts).catch(() => {})
  }, [filter])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
          Alerts
        </h1>
        <div className="flex gap-2">
          {['', 'active', 'acknowledged', 'resolved'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: filter === f ? 'rgba(14,165,233,0.1)' : 'transparent', color: filter === f ? 'var(--color-accent)' : 'var(--color-text-tertiary)', border: `1px solid ${filter === f ? 'rgba(14,165,233,0.2)' : 'var(--color-border)'}` }}>
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>
      {alerts.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No alerts</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
        </div>
      )}
    </div>
  )
}
