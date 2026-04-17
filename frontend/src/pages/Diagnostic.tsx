import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'
import { usePrivacy } from '../hooks/usePrivacy'

interface PingResult {
  packets_sent: number
  packets_recv: number
  packet_loss: number
  min_rtt_ms: number
  avg_rtt_ms: number
  max_rtt_ms: number
  stddev_rtt_ms: number
}

export function Diagnostic() {
  const { maskIp } = usePrivacy()
  const [target, setTarget] = useState('')
  const [count, setCount] = useState('4')
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('ping', target.trim(), { count: parseInt(count, 10) })
  }

  const result = scan?.result as unknown as PingResult | null

  function lossColor(loss: number) {
    if (loss === 0) return 'var(--color-green)'
    if (loss < 50) return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  function rttColor(ms: number) {
    if (ms < 50) return 'var(--color-green)'
    if (ms < 150) return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  return (
    <ToolPage
      title="Ping"
      description="Test host reachability and measure latency with ICMP ping"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        result && scan?.status === 'completed' ? (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>Packet Loss</div>
                <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: lossColor(result.packet_loss) }}>
                  {result.packet_loss.toFixed(1)}%
                </div>
                <div className="text-xs mt-1" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                  {result.packets_recv}/{result.packets_sent} received
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>Avg Latency</div>
                <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: rttColor(result.avg_rtt_ms) }}>
                  {result.avg_rtt_ms.toFixed(2)}
                </div>
                <div className="text-xs mt-1" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>ms</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>Min / Max</div>
                <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
                  {result.min_rtt_ms.toFixed(2)}
                </div>
                <div className="text-xs mt-1" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                  / {result.max_rtt_ms.toFixed(2)} ms
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>Jitter</div>
                <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: result.stddev_rtt_ms < 5 ? 'var(--color-green)' : result.stddev_rtt_ms < 20 ? 'var(--color-yellow)' : 'var(--color-red)' }}>
                  {result.stddev_rtt_ms.toFixed(2)}
                </div>
                <div className="text-xs mt-1" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>ms stddev</div>
              </div>
            </div>

            {/* Summary line */}
            <div className="rounded-xl px-5 py-4 flex items-center gap-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>Latency</div>
              <div className="flex items-center gap-6 text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>min <span style={{ color: 'var(--color-green)' }}>{result.min_rtt_ms.toFixed(2)}ms</span></span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>avg <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{result.avg_rtt_ms.toFixed(2)}ms</span></span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>max <span style={{ color: result.max_rtt_ms > 100 ? 'var(--color-red)' : 'var(--color-yellow)' }}>{result.max_rtt_ms.toFixed(2)}ms</span></span>
              </div>
            </div>

            {/* Target info */}
            <div className="flex items-center gap-3 px-1">
              <span className="w-2 h-2 rounded-full" style={{ background: result.packet_loss === 0 ? 'var(--color-green)' : 'var(--color-red)', boxShadow: result.packet_loss === 0 ? '0 0 6px var(--color-green)' : '0 0 6px var(--color-red)' }} />
              <span className="text-xs" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}>
                {maskIp(scan.target)} is {result.packet_loss === 0 ? 'reachable' : result.packets_recv > 0 ? 'partially reachable' : 'unreachable'}
              </span>
            </div>
          </div>
        ) : scan?.status === 'failed' ? (
          <div className="rounded-lg px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)', fontFamily: 'var(--font-family-mono)' }}>
            {scan.error ?? 'Scan failed'}
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
              Target Host / IP
            </label>
            <input type="text" value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 8.8.8.8 or example.com" required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
              Ping Count
            </label>
            <input type="number" value={count} onChange={(e) => setCount(e.target.value)} min="1" max="20"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }} />
          </div>
        </div>
        <div>
          <button type="submit" disabled={submitting || polling}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{ background: 'linear-gradient(to right, var(--color-accent), #0284c7)', opacity: submitting || polling ? 0.6 : 1, fontFamily: 'var(--font-family-heading)' }}>
            {submitting ? 'Starting...' : polling ? 'Running...' : 'Run Ping'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
