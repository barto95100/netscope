import { useEffect, useState } from 'react'
import { api, type Monitor } from '../api/client'

export function Monitors() {
  const [monitors, setMonitors] = useState<Monitor[]>([])

  useEffect(() => {
    api.monitors.list().then(setMonitors).catch(() => {})
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
        Uptime Checks
      </h1>
      {monitors.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No monitors configured yet</p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>Create monitors via the API to start tracking uptime</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monitors.map((m) => (
            <div key={m.id} className="flex items-center gap-4 px-4 py-3 rounded-lg" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: m.last_status === 'up' ? 'var(--color-green)' : m.last_status === 'down' ? 'var(--color-red)' : 'var(--color-text-tertiary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{m.name}</span>
              <span className="text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}>{m.target}</span>
              <span className="ml-auto text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>{m.type} / {m.interval_sec}s</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
