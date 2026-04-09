import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

interface Hop {
  hop: number
  host?: string
  ip?: string
  rtt_ms?: number
  loss?: number
}

interface TracerouteResult {
  hops?: Hop[]
  [key: string]: unknown
}

export function Traceroute() {
  const [target, setTarget] = useState('')
  const [maxHops, setMaxHops] = useState('30')
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('traceroute', target.trim(), { max_hops: parseInt(maxHops, 10) })
  }

  const result = scan?.result as TracerouteResult | null
  const hops = result?.hops ?? []

  return (
    <ToolPage
      title="Traceroute / MTR"
      description="Trace the network path to a host, measuring latency at each hop"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        scan?.result && scan.status === 'completed' ? (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                Route ({hops.length} hops)
              </span>
            </div>

            {hops.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['#', 'Host', 'IP', 'RTT (ms)', 'Loss'].map((col) => (
                        <th key={col} className="px-4 py-2 text-left font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hops.map((h, i) => {
                      const lossColor = (h.loss ?? 0) > 50 ? 'var(--color-red)' : (h.loss ?? 0) > 0 ? 'var(--color-yellow)' : 'var(--color-green)'
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td className="px-4 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{h.hop}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--color-text-primary)' }}>{h.host ?? '*'}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--color-accent)' }}>{h.ip ?? '*'}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--color-text-primary)' }}>
                            {h.rtt_ms !== undefined ? h.rtt_ms.toFixed(2) : '*'}
                          </td>
                          <td className="px-4 py-2.5" style={{ color: lossColor }}>
                            {h.loss !== undefined ? `${h.loss}%` : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="p-4 text-xs overflow-x-auto" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)', lineHeight: 1.6 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label
              className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
            >
              Target Host / IP
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 8.8.8.8 or example.com"
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
            <label
              className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
            >
              Max Hops
            </label>
            <input
              type="number"
              value={maxHops}
              onChange={(e) => setMaxHops(e.target.value)}
              min="1"
              max="64"
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
            {submitting ? 'Starting...' : polling ? 'Tracing...' : 'Run Traceroute'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
