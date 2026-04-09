import { useEffect, useState, useCallback } from 'react'
// api client used via fetch directly for netpath endpoints

interface NetPath {
  id: string
  name: string
  target: string
  interval_sec: number
  enabled: boolean
  last_trace_at: string | null
  last_route_hash: string | null
  created_at: string
}

interface TraceHop {
  ttl: number
  address: string
  host?: string
  rtt_ms: number
  loss_percent?: number
  city?: string
  country?: string
  isp?: string
}

interface Trace {
  id: number
  netpath_id: string
  route_hash: string
  route_changed: boolean
  hops: TraceHop[]
  hop_count: number
  created_at: string
}

// Fetch helpers
async function fetchNetPaths(): Promise<NetPath[]> {
  const res = await fetch('/api/netpaths')
  return res.json()
}

async function fetchTraces(id: string, limit = 50): Promise<Trace[]> {
  const res = await fetch(`/api/netpaths/${id}/traces?limit=${limit}`)
  const data = await res.json()
  // Parse hops from JSON
  return data.map((t: Trace & { hops: string | TraceHop[] }) => ({
    ...t,
    hops: typeof t.hops === 'string' ? JSON.parse(t.hops) : t.hops,
  }))
}

async function fetchChanges(id: string): Promise<Trace[]> {
  const res = await fetch(`/api/netpaths/${id}/changes?limit=20`)
  const data = await res.json()
  return data.map((t: Trace & { hops: string | TraceHop[] }) => ({
    ...t,
    hops: typeof t.hops === 'string' ? JSON.parse(t.hops) : t.hops,
  }))
}

export function NetPathPage() {
  const [paths, setPaths] = useState<NetPath[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [traces, setTraces] = useState<Trace[]>([])
  const [changes, setChanges] = useState<Trace[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [interval, setIntervalVal] = useState(300)
  const [creating, setCreating] = useState(false)
  const [selectedTraceIdx, setSelectedTraceIdx] = useState(0)
  const [compareIdx, setCompareIdx] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    const p = await fetchNetPaths()
    setPaths(p)
    if (p.length > 0 && !selected) setSelected(p[0].id)
  }, [selected])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!selected) return
    fetchTraces(selected).then(setTraces)
    fetchChanges(selected).then(setChanges)
    const id = window.setInterval(() => {
      fetchTraces(selected).then(setTraces)
    }, 15000)
    return () => window.clearInterval(id)
  }, [selected])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await fetch('/api/netpaths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, target, interval_sec: interval }),
      })
      setName('')
      setTarget('')
      setShowForm(false)
      refresh()
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/netpaths/${id}`, { method: 'DELETE' })
    if (selected === id) setSelected(null)
    refresh()
  }

  const currentTrace = traces[selectedTraceIdx]
  const compareTrace = compareIdx !== null ? traces[compareIdx] : null
  const selectedPath = paths.find(p => p.id === selected)

  // Find divergences between current and compare traces
  function findDivergences(current: TraceHop[], compare: TraceHop[]): Map<number, TraceHop> {
    const divs = new Map<number, TraceHop>()
    const maxLen = Math.max(current.length, compare.length)
    for (let i = 0; i < maxLen; i++) {
      const c = current[i]
      const p = compare[i]
      if (!c || !p) continue
      if (c.address !== p.address) {
        divs.set(i, p)
      }
    }
    return divs
  }

  const divergences = currentTrace && compareTrace
    ? findDivergences(currentTrace.hops, compareTrace.hops)
    : new Map<number, TraceHop>()

  function rttColor(ms: number) {
    if (ms < 30) return '#10b981'
    if (ms < 100) return '#eab308'
    return '#ef4444'
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
            NetPath
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Network Path Analysis &middot; Continuous route monitoring
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
          + New Path
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl p-5 mb-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Route to HACF" required
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Target</label>
              <input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. hacf.fr" required
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>Interval</label>
              <select value={interval} onChange={e => setIntervalVal(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                <option value={60}>1 min</option>
                <option value={300}>5 min</option>
                <option value={600}>10 min</option>
                <option value={1800}>30 min</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            <button type="submit" disabled={creating} className="px-6 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--color-accent), #0284c7)' }}>
              {creating ? 'Creating...' : 'Create Path'}
            </button>
          </div>
        </form>
      )}

      {/* Path selector tabs */}
      {paths.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {paths.map(p => (
            <button key={p.id} onClick={() => { setSelected(p.id); setSelectedTraceIdx(0); setCompareIdx(null) }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0"
              style={{
                background: selected === p.id ? 'rgba(14,165,233,0.1)' : 'var(--color-bg-card)',
                border: `1px solid ${selected === p.id ? 'rgba(14,165,233,0.3)' : 'var(--color-border)'}`,
                color: selected === p.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}>
              <span className="w-2 h-2 rounded-full" style={{ background: p.enabled ? 'var(--color-green)' : 'var(--color-text-tertiary)' }} />
              {p.name}
              <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>{p.target}</span>
              <button onClick={e => { e.stopPropagation(); handleDelete(p.id) }} className="ml-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>✕</button>
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      {selected && currentTrace && (
        <div className="space-y-4">
          {/* Metro visualization */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                  Network Path
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-family-mono)', background: 'rgba(14,165,233,0.08)', color: 'var(--color-accent)' }}>
                  {currentTrace.hop_count} hops
                </span>
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                  {new Date(currentTrace.created_at).toLocaleString()}
                </span>
              </div>
              {compareTrace && (
                <button onClick={() => setCompareIdx(null)} className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
                  Clear compare
                </button>
              )}
            </div>

            {/* Metro map - SOC style */}
            <div className="overflow-x-auto" style={{
              background: 'linear-gradient(180deg, #06080d 0%, #0a0e16 100%)',
              backgroundImage: `
                linear-gradient(rgba(14,165,233,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(14,165,233,0.03) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}>
              <div className="p-8 pb-6" style={{ minWidth: Math.max(currentTrace.hops.length * 110, 700) }}>
                <svg width="100%" height={compareTrace ? 240 : 160} style={{ overflow: 'visible' }}>
                  <defs>
                    <filter id="ng"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                    <filter id="ng2"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                    <style>{`
                      @keyframes dflow { to { stroke-dashoffset: -24; } }
                      .np-tooltip { pointer-events: none; opacity: 0; transition: opacity 0.2s; }
                      .np-hop:hover .np-tooltip { opacity: 1; }
                    `}</style>
                  </defs>

                  {/* === COMPARE (old) route rendered FIRST (behind) === */}
                  {compareTrace && (() => {
                    const maxLen = Math.max(currentTrace.hops.length, compareTrace.hops.length)
                    const oldY = 160
                    // Find divergence ranges
                    const divStart: number[] = []
                    const divEnd: number[] = []
                    let inDiv = false
                    for (let i = 0; i < maxLen; i++) {
                      const cAddr = currentTrace.hops[i]?.address
                      const pAddr = compareTrace.hops[i]?.address
                      const isDiff = cAddr !== pAddr
                      if (isDiff && !inDiv) { divStart.push(i); inDiv = true }
                      if (!isDiff && inDiv) { divEnd.push(i); inDiv = false }
                    }
                    if (inDiv) divEnd.push(maxLen - 1)

                    return divStart.map((start, si) => {
                      const end = divEnd[si] ?? maxLen - 1
                      const items = []
                      // Branch down from main line
                      const branchX = ((start > 0 ? start - 1 : 0) / (maxLen - 1)) * 100
                      const startX = (start / (maxLen - 1)) * 100
                      items.push(
                        <path key={`br-down-${si}`}
                          d={`M ${branchX}% 80 C ${branchX}% 120 ${startX}% 120 ${startX}% ${oldY}`}
                          fill="none" stroke="#7a8ba8" strokeWidth={1.5} strokeOpacity={0.3} strokeDasharray="5 5" />
                      )
                      // Old route segments
                      for (let i = start; i <= end; i++) {
                        const hop = compareTrace.hops[i]
                        if (!hop) continue
                        const x = (i / (maxLen - 1)) * 100
                        // Line between old hops
                        if (i > start) {
                          const px = ((i - 1) / (maxLen - 1)) * 100
                          items.push(
                            <line key={`ol-${i}`} x1={`${px}%`} y1={oldY} x2={`${x}%`} y2={oldY}
                              stroke="#7a8ba8" strokeWidth={1.5} strokeOpacity={0.25} strokeDasharray="4 4" strokeLinecap="round" />
                          )
                        }
                        // Old node
                        items.push(
                          <g key={`on-${i}`}>
                            <circle cx={`${x}%`} cy={oldY} r={6} fill="#0a0e16" stroke="#7a8ba8" strokeWidth={1} strokeOpacity={0.4} />
                            <circle cx={`${x}%`} cy={oldY} r={2} fill="#7a8ba8" fillOpacity={0.4} />
                            <text x={`${x}%`} y={oldY + 18} textAnchor="middle" fontSize={8}
                              fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8" opacity={0.4}>
                              {hop.address || '???'}
                            </text>
                          </g>
                        )
                      }
                      // Branch back up
                      const endX = (end / (maxLen - 1)) * 100
                      const rejoinX = ((end < maxLen - 1 ? end + 1 : end) / (maxLen - 1)) * 100
                      items.push(
                        <path key={`br-up-${si}`}
                          d={`M ${endX}% ${oldY} C ${endX}% 120 ${rejoinX}% 120 ${rejoinX}% 80`}
                          fill="none" stroke="#7a8ba8" strokeWidth={1.5} strokeOpacity={0.3} strokeDasharray="5 5" />
                      )
                      // Label
                      items.push(
                        <text key={`lbl-${si}`} x={`${(parseFloat(String(startX)) + parseFloat(String(endX))) / 2}%`} y={oldY + 32}
                          textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#ef4444" opacity={0.4}
                          letterSpacing="1">PREVIOUS ROUTE</text>
                      )
                      return <g key={`divg-${si}`}>{items}</g>
                    })
                  })()}

                  {/* === CURRENT route lines === */}
                  {currentTrace.hops.map((hop, i) => {
                    if (i === 0) return null
                    const x1 = ((i - 1) / (currentTrace.hops.length - 1)) * 100
                    const x2 = (i / (currentTrace.hops.length - 1)) * 100
                    const color = rttColor(hop.rtt_ms)
                    return (
                      <g key={`cl-${i}`}>
                        <line x1={`${x1}%`} y1={80} x2={`${x2}%`} y2={80} stroke={color} strokeWidth={8} strokeOpacity={0.05} strokeLinecap="round" />
                        <line x1={`${x1}%`} y1={80} x2={`${x2}%`} y2={80} stroke={color} strokeWidth={3} strokeOpacity={0.15} strokeLinecap="round" />
                        <line x1={`${x1}%`} y1={80} x2={`${x2}%`} y2={80} stroke={color} strokeWidth={2} strokeOpacity={0.7} strokeLinecap="round" filter="url(#ng)" />
                        <line x1={`${x1}%`} y1={80} x2={`${x2}%`} y2={80} stroke={color} strokeWidth={2} strokeOpacity={0.4} strokeDasharray="2 22" strokeLinecap="round"
                          style={{ animation: 'dflow 1.5s linear infinite' }} />
                      </g>
                    )
                  })}

                  {/* === CURRENT route nodes === */}
                  {currentTrace.hops.map((hop, i) => {
                    const x = (i / (currentTrace.hops.length - 1)) * 100
                    const isFirst = i === 0
                    const isLast = i === currentTrace.hops.length - 1
                    const hasDivergence = divergences.has(i)
                    const color = isFirst ? '#10b981' : isLast ? '#ef4444' : rttColor(hop.rtt_ms)
                    const r = isFirst || isLast ? 10 : 7

                    return (
                      <g key={`cn-${i}`} className="np-hop" style={{ cursor: 'pointer' }}>
                        {/* Scan ring */}
                        <circle cx={`${x}%`} cy={80} r={14} fill="none" stroke={color} strokeWidth={0.5} strokeOpacity={0.2}>
                          <animate attributeName="r" values="12;22;12" dur={`${2 + i * 0.15}s`} repeatCount="indefinite" />
                          <animate attributeName="stroke-opacity" values="0.2;0;0.2" dur={`${2 + i * 0.15}s`} repeatCount="indefinite" />
                        </circle>
                        {/* Outer glow ring */}
                        <circle cx={`${x}%`} cy={80} r={r + 4} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={0.5} strokeOpacity={0.25} />
                        {/* Main circle */}
                        <circle cx={`${x}%`} cy={80} r={r} fill="#0a0e16" stroke={color} strokeWidth={2} filter="url(#ng)" />
                        {/* Center glow */}
                        <circle cx={`${x}%`} cy={80} r={r - 3} fill={color} fillOpacity={0.3} filter="url(#ng2)" />
                        {/* RTT inside node */}
                        {hop.rtt_ms > 0 && r >= 7 && (
                          <text x={`${x}%`} y={84} textAnchor="middle" fontSize={7}
                            fontFamily="'IBM Plex Mono',monospace" fill={color} fontWeight="bold">
                            {hop.rtt_ms < 10 ? hop.rtt_ms.toFixed(1) : Math.round(hop.rtt_ms)}
                          </text>
                        )}
                        {/* Divergence warning ring */}
                        {hasDivergence && (
                          <circle cx={`${x}%`} cy={80} r={r + 8} fill="none" stroke="#eab308" strokeWidth={1} strokeDasharray="3 3">
                            <animate attributeName="r" values={`${r + 6};${r + 14};${r + 6}`} dur="1.5s" repeatCount="indefinite" />
                            <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite" />
                          </circle>
                        )}
                        {/* Source/Target labels */}
                        {isFirst && <text x={`${x}%`} y={48} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill="#10b981" filter="url(#ng)" letterSpacing="2">SOURCE</text>}
                        {isLast && <text x={`${x}%`} y={48} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill="#ef4444" filter="url(#ng)" letterSpacing="2">TARGET</text>}
                        {/* IP below node */}
                        <text x={`${x}%`} y={102} textAnchor="middle" fontSize={8}
                          fontFamily="'IBM Plex Mono',monospace" fill={color} opacity={0.8}>
                          {hop.address || '*'}
                        </text>
                        {/* Hostname */}
                        {hop.host && hop.host !== hop.address && (
                          <text x={`${x}%`} y={113} textAnchor="middle" fontSize={7}
                            fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8" opacity={0.5}>
                            {hop.host.length > 18 ? hop.host.slice(0, 18) + '…' : hop.host}
                          </text>
                        )}

                        {/* Hover tooltip */}
                        <g className="np-tooltip">
                          <rect x={`${x}%`} y={-5} width={160} height={75} rx={8}
                            transform={`translate(-80, 0)`}
                            fill="#0b0f18" stroke={`${color}40`} strokeWidth={1}
                            style={{ filter: `drop-shadow(0 0 12px ${color}20)` }} />
                          <text x={`${x}%`} y={12} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={color} fontWeight="600">
                            {isFirst ? 'Source' : isLast ? 'Destination' : `Hop ${i + 1}`}
                          </text>
                          <text x={`${x}%`} y={25} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#0ea5e9">
                            {hop.address || '*'}
                          </text>
                          {hop.rtt_ms > 0 && (
                            <text x={`${x}%`} y={38} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={rttColor(hop.rtt_ms)} fontWeight="bold">
                              {hop.rtt_ms.toFixed(2)} ms
                            </text>
                          )}
                          {hop.city && (
                            <text x={`${x}%`} y={50} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8">
                              {hop.city}{hop.country ? `, ${hop.country}` : ''}
                            </text>
                          )}
                          {hop.isp && (
                            <text x={`${x}%`} y={62} textAnchor="middle" fontSize={7} fontFamily="'IBM Plex Mono',monospace" fill="#4a5568">
                              {hop.isp.length > 25 ? hop.isp.slice(0, 25) + '…' : hop.isp}
                            </text>
                          )}
                        </g>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* Timeline + Route changes */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Recent traces timeline */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                  Trace History
                </span>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {traces.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                    onClick={() => { setSelectedTraceIdx(i); setCompareIdx(null) }}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: selectedTraceIdx === i ? 'rgba(14,165,233,0.05)' : compareIdx === i ? 'rgba(122,139,168,0.05)' : 'transparent',
                    }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{
                      background: t.route_changed ? 'var(--color-yellow)' : 'var(--color-green)',
                      boxShadow: t.route_changed ? '0 0 6px var(--color-yellow)' : 'none',
                    }} />
                    <span className="text-xs flex-1" style={{ fontFamily: 'var(--font-family-mono)', color: selectedTraceIdx === i ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                      {new Date(t.created_at).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px]" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                      {t.hop_count} hops
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                      fontFamily: 'var(--font-family-mono)',
                      background: t.route_changed ? 'rgba(234,179,8,0.1)' : 'rgba(14,165,233,0.05)',
                      color: t.route_changed ? 'var(--color-yellow)' : 'var(--color-text-tertiary)',
                    }}>
                      {t.route_hash.slice(0, 8)}
                    </span>
                    {i !== selectedTraceIdx && (
                      <button onClick={e => { e.stopPropagation(); setCompareIdx(i) }} className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
                        title="Compare with current">
                        diff
                      </button>
                    )}
                  </div>
                ))}
                {traces.length === 0 && (
                  <div className="p-8 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Waiting for first trace...
                  </div>
                )}
              </div>
            </div>

            {/* Route changes */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                  Route Changes
                </span>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {changes.map(t => (
                  <div key={t.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-yellow)', boxShadow: '0 0 6px var(--color-yellow)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--color-yellow)' }}>Route Changed</span>
                      <span className="text-[10px]" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-tertiary)' }}>
                        {new Date(t.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[10px] flex items-center gap-2" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}>
                      <span>{t.hop_count} hops</span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>hash: {t.route_hash.slice(0, 12)}</span>
                    </div>
                  </div>
                ))}
                {changes.length === 0 && (
                  <div className="p-8 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    No route changes detected yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {paths.length === 0 && !showForm && (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No network paths configured</p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>Click "New Path" to start monitoring a network route</p>
        </div>
      )}

      {selected && !currentTrace && (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <span className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
            Waiting for first trace... ({selectedPath?.interval_sec}s interval)
          </span>
        </div>
      )}
    </div>
  )
}
