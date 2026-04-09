import { type FormEvent, useState, useRef, useCallback, useEffect } from 'react'
import { api, type Scan } from '../api/client'

interface TracerouteHop {
  ttl: number
  host?: string
  address?: string
  rtt_ms?: number
  timeout?: boolean
}

interface MtrHopLive {
  ttl: number
  host: string
  sent: number
  recv: number
  loss_percent: number
  last_ms: number
  best_ms: number
  avg_ms: number
  worst_ms: number
  stddev_ms: number
}

interface TracerouteResult {
  target: string
  hops: TracerouteHop[]
}

type Mode = 'traceroute' | 'mtr'

export function Traceroute() {
  const [target, setTarget] = useState('')
  const [maxHops, setMaxHops] = useState('30')
  const [mode, setMode] = useState<Mode>('traceroute')
  const [running, setRunning] = useState(false)
  const [traceHops, setTraceHops] = useState<TracerouteHop[]>([])
  const [mtrHops, setMtrHops] = useState<MtrHopLive[]>([])
  const [mtrSent, setMtrSent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const stopRef = useRef(false)

  const cleanup = useCallback(() => {
    stopRef.current = true
    if (wsRef.current) {
      try { wsRef.current.send('stop') } catch {}
      wsRef.current.close()
      wsRef.current = null
    }
    setRunning(false)
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  async function pollScan(scanId: string): Promise<Scan> {
    return new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        if (stopRef.current) { clearInterval(poll); reject(new Error('stopped')); return }
        try {
          const s = await api.scans.get(scanId)
          if (s.status === 'completed' || s.status === 'failed') {
            clearInterval(poll)
            resolve(s)
          }
        } catch (e) { clearInterval(poll); reject(e) }
      }, 1000)
    })
  }

  async function handleTraceroute(e: FormEvent) {
    e.preventDefault()
    if (!target.trim()) return
    setError(null)
    setTraceHops([])
    setMtrHops([])
    setRunning(true)
    stopRef.current = false

    try {
      const scan = await api.scans.create({ type: 'traceroute', target: target.trim(), options: { max_hops: parseInt(maxHops, 10) } })
      const result = await pollScan(scan.id)
      if (result.status === 'failed') {
        setError(result.error || 'Traceroute failed')
      } else {
        const r = result.result as unknown as TracerouteResult
        setTraceHops(r?.hops || [])
      }
    } catch (err) {
      if (!stopRef.current) setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRunning(false)
    }
  }

  function handleMtr(e: FormEvent) {
    e.preventDefault()
    if (!target.trim()) return
    setError(null)
    setTraceHops([])
    setMtrHops([])
    setMtrSent(0)
    setRunning(true)
    stopRef.current = false

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/api/ws/mtr/${encodeURIComponent(target.trim())}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.hops) {
          setMtrHops(data.hops)
          // Calculate total sent across all hops
          const total = data.hops.reduce((acc: number, h: MtrHopLive) => Math.max(acc, h.sent), 0)
          setMtrSent(total)
        }
        if (data.type === 'done') {
          setRunning(false)
        }
      } catch {}
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
      setRunning(false)
    }

    ws.onclose = () => {
      setRunning(false)
    }
  }

  function handleStop() {
    cleanup()
  }

  function lossColor(loss: number) {
    if (loss === 0) return 'var(--color-green)'
    if (loss < 10) return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  function rttColor(ms: number) {
    if (ms < 30) return 'var(--color-green)'
    if (ms < 100) return 'var(--color-yellow)'
    return 'var(--color-red)'
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
          Traceroute / MTR
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Trace network path and measure latency at each hop
        </p>
      </div>

      <form onSubmit={mode === 'mtr' ? handleMtr : handleTraceroute} className="rounded-xl p-5 mb-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        {/* Mode toggle */}
        <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit" style={{ background: 'var(--color-bg-surface)' }}>
          {(['traceroute', 'mtr'] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => { if (!running) setMode(m) }}
              className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: mode === m ? 'var(--color-accent)' : 'transparent',
                color: mode === m ? 'white' : 'var(--color-text-tertiary)',
              }}>
              {m === 'traceroute' ? 'Traceroute' : 'MTR (live)'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
              Target
            </label>
            <input type="text" value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 8.8.8.8 or example.com" required disabled={running}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }} />
          </div>
          {mode === 'traceroute' && (
            <div>
              <label className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
                style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                Max Hops
              </label>
              <input type="number" value={maxHops} onChange={(e) => setMaxHops(e.target.value)}
                min="1" max="64" disabled={running}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }} />
            </div>
          )}
        </div>

        <div className="flex gap-3 items-center">
          {!running ? (
            <button type="submit" className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(to right, var(--color-accent), #0284c7)', fontFamily: 'var(--font-family-heading)' }}>
              {mode === 'mtr' ? 'Start MTR' : 'Run Traceroute'}
            </button>
          ) : (
            <button type="button" onClick={handleStop} className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--color-red)', fontFamily: 'var(--font-family-heading)' }}>
              Stop
            </button>
          )}
          {running && mode === 'mtr' && (
            <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
              Live &middot; {mtrSent} pings sent
            </span>
          )}
          {running && mode === 'traceroute' && (
            <span className="text-xs" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
              Tracing route...
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-lg px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)', fontFamily: 'var(--font-family-mono)' }}>
          {error}
        </div>
      )}

      {/* Traceroute result */}
      {traceHops.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
              Route ({traceHops.length} hops)
            </span>
          </div>
          <table className="w-full text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['#', 'Host', 'IP', 'RTT'].map((col) => (
                  <th key={col} className="px-4 py-2 text-left font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traceHops.map((h, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{h.ttl}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-primary)' }}>{h.timeout ? '*' : (h.host || h.address || '*')}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-accent)' }}>{h.timeout ? '*' : (h.address || '*')}</td>
                  <td className="px-4 py-2.5" style={{ color: h.timeout ? 'var(--color-text-tertiary)' : rttColor(h.rtt_ms || 0) }}>
                    {h.timeout ? '*' : `${h.rtt_ms?.toFixed(2) ?? '*'}ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MTR live result */}
      {mtrHops.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
              MTR &middot; {mtrHops.length} hops &middot; {mtrSent} pings
            </span>
            {running && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['#', 'Host', 'Loss%', 'Snt', 'Rcv', 'Last', 'Best', 'Avg', 'Worst', 'StDev'].map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mtrHops.map((h) => (
                  <tr key={h.ttl} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="px-3 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{h.ttl + 1}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--color-text-primary)' }}>{h.host}</td>
                    <td className="px-3 py-2.5" style={{ color: lossColor(h.loss_percent) }}>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-surface)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(h.loss_percent, 100)}%`, background: lossColor(h.loss_percent) }} />
                        </div>
                        {h.loss_percent.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{h.sent}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{h.recv}</td>
                    <td className="px-3 py-2.5" style={{ color: rttColor(h.last_ms) }}>{h.last_ms > 0 ? h.last_ms.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2.5" style={{ color: rttColor(h.best_ms) }}>{h.best_ms > 0 ? h.best_ms.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2.5 font-semibold" style={{ color: rttColor(h.avg_ms) }}>{h.avg_ms > 0 ? h.avg_ms.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2.5" style={{ color: rttColor(h.worst_ms) }}>{h.worst_ms > 0 ? h.worst_ms.toFixed(1) : '-'}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{h.stddev_ms > 0 ? h.stddev_ms.toFixed(1) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {running && mtrHops.length === 0 && traceHops.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <span className="text-sm" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
            {mode === 'mtr' ? 'Starting MTR...' : 'Tracing route...'}
          </span>
        </div>
      )}
    </div>
  )
}
