import { useEffect, useState, useCallback } from 'react'
import { api, type Monitor } from '../api/client'

export function Monitors() {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('http')
  const [target, setTarget] = useState('')
  const [interval, setInterval] = useState(60)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(() => {
    api.monitors.list().then(setMonitors).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 10000)
    return () => window.clearInterval(id)
  }, [refresh])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.monitors.create({ name, type, target, interval_sec: interval })
      setName('')
      setTarget('')
      setShowForm(false)
      refresh()
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    await api.monitors.delete(id)
    refresh()
  }

  async function handleToggle(m: Monitor) {
    await api.monitors.update(m.id, { ...m, enabled: !m.enabled })
    refresh()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
            Uptime Checks
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {monitors.length} monitor{monitors.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}
        >
          + New Monitor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl p-5 mb-6 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production API" required
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                <option value="http">HTTP(S)</option>
                <option value="tcp">TCP</option>
                <option value="icmp">ICMP Ping</option>
                <option value="ssl_expiry">SSL Expiry</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Target</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={type === 'http' ? 'https://example.com' : type === 'tcp' ? '192.168.1.1:3306' : '8.8.8.8'} required
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Interval (sec)</label>
              <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                <option value={30}>30s</option>
                <option value={60}>1 min</option>
                <option value={300}>5 min</option>
                <option value={600}>10 min</option>
                <option value={1800}>30 min</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Cancel
            </button>
            <button type="submit" disabled={creating || !name || !target} className="px-6 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
              {creating ? 'Creating...' : 'Create Monitor'}
            </button>
          </div>
        </form>
      )}

      {monitors.length === 0 && !showForm ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No monitors configured yet</p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>Click "New Monitor" to start tracking uptime</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monitors.map((m) => (
            <div key={m.id} className="flex items-center gap-4 px-4 py-3 rounded-lg transition-colors"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{
                background: !m.enabled ? 'var(--color-text-tertiary)' : m.last_status === 'up' ? 'var(--color-green)' : m.last_status === 'down' ? 'var(--color-red)' : 'var(--color-yellow)',
                boxShadow: m.enabled && m.last_status === 'up' ? '0 0 6px var(--color-green)' : m.enabled && m.last_status === 'down' ? '0 0 6px var(--color-red)' : 'none'
              }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: m.enabled ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{m.name}</span>
                  {!m.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-tertiary)' }}>paused</span>}
                </div>
                <span className="text-xs truncate block" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>{m.target}</span>
              </div>
              <span className="text-xs px-2 py-1 rounded" style={{
                fontFamily: 'var(--font-family-mono)',
                background: 'rgba(14,165,233,0.08)',
                color: 'var(--color-accent)'
              }}>{m.type}</span>
              <span className="text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                every {m.interval_sec >= 60 ? `${m.interval_sec / 60}m` : `${m.interval_sec}s`}
              </span>
              <div className="flex gap-1">
                <button onClick={() => handleToggle(m)} className="px-2 py-1 rounded text-xs transition-colors"
                  style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
                  title={m.enabled ? 'Pause' : 'Resume'}>
                  {m.enabled ? '⏸' : '▶'}
                </button>
                <button onClick={() => handleDelete(m.id)} className="px-2 py-1 rounded text-xs transition-colors"
                  style={{ color: 'var(--color-red)', border: '1px solid rgba(239,68,68,0.2)' }}
                  title="Delete">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
