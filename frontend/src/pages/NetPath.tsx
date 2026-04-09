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

  function rttColor(ms: number) {
    if (ms < 30) return '#10b981'
    if (ms < 100) return '#eab308'
    return '#ef4444'
  }

  // Build unified metro topology from current + compare traces
  type MetroNode = { addr: string; hop?: TraceHop; oldHop?: TraceHop; isCurrent: boolean; isOld: boolean; row: 'main' | 'branch' }
  type MetroSegment = { from: number; to: number; row: 'main' | 'branch'; active: boolean }

  function buildMetro(current: TraceHop[], compare?: TraceHop[]) {
    const nodes: MetroNode[] = []
    const segments: MetroSegment[] = []

    if (!compare) {
      // Simple case: no comparison
      current.forEach(h => {
        nodes.push({ addr: h.address, hop: h, isCurrent: true, isOld: false, row: 'main' })
      })
      for (let i = 1; i < nodes.length; i++) segments.push({ from: i - 1, to: i, row: 'main', active: true })
      return { nodes, segments }
    }

    // Find common prefix
    let prefixEnd = 0
    while (prefixEnd < current.length && prefixEnd < compare.length && current[prefixEnd].address === compare[prefixEnd].address) {
      prefixEnd++
    }

    // Find common suffix (from the end)
    let suffixStart = 0
    const cLen = current.length
    const pLen = compare.length
    while (suffixStart < cLen && suffixStart < pLen) {
      const ci = cLen - 1 - suffixStart
      const pi = pLen - 1 - suffixStart
      if (ci <= prefixEnd || pi <= prefixEnd) break
      if (current[ci].address !== compare[pi].address) break
      suffixStart++
    }
    const currentSuffixIdx = cLen - suffixStart
    const compareSuffixIdx = pLen - suffixStart

    // Common prefix nodes
    for (let i = 0; i < prefixEnd; i++) {
      nodes.push({ addr: current[i].address, hop: current[i], oldHop: compare[i], isCurrent: true, isOld: true, row: 'main' })
    }

    // Divergent section - current route stays on main
    const branchStartIdx = nodes.length > 0 ? nodes.length - 1 : 0
    for (let i = prefixEnd; i < currentSuffixIdx; i++) {
      nodes.push({ addr: current[i].address, hop: current[i], isCurrent: true, isOld: false, row: 'main' })
    }
    const branchRejoinsIdx = nodes.length // where the branch will rejoin

    // Divergent section - old route on branch
    const branchNodes: MetroNode[] = []
    for (let i = prefixEnd; i < compareSuffixIdx; i++) {
      branchNodes.push({ addr: compare[i].address, oldHop: compare[i], isCurrent: false, isOld: true, row: 'branch' })
    }

    // Common suffix nodes
    for (let i = currentSuffixIdx; i < cLen; i++) {
      const pi = compareSuffixIdx + (i - currentSuffixIdx)
      nodes.push({ addr: current[i].address, hop: current[i], oldHop: compare[pi], isCurrent: true, isOld: true, row: 'main' })
    }

    // Build main line segments
    for (let i = 1; i < nodes.length; i++) segments.push({ from: i - 1, to: i, row: 'main', active: true })

    // Insert branch nodes and segments
    const branchOffset = nodes.length
    nodes.push(...branchNodes)
    // Branch segments
    for (let i = 1; i < branchNodes.length; i++) segments.push({ from: branchOffset + i - 1, to: branchOffset + i, row: 'branch', active: false })
    // Connect branch to main: start
    if (branchNodes.length > 0) {
      segments.push({ from: branchStartIdx, to: branchOffset, row: 'branch', active: false })
      // Connect branch end back to main
      if (branchRejoinsIdx < nodes.length - branchNodes.length) {
        segments.push({ from: branchOffset + branchNodes.length - 1, to: branchRejoinsIdx, row: 'branch', active: false })
      }
    }

    return { nodes, segments, branchOffset, branchCount: branchNodes.length }
  }

  const metro = currentTrace ? buildMetro(currentTrace.hops, compareTrace?.hops) : null

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
            {metro && (
            <div className="overflow-x-auto" style={{
              background: 'linear-gradient(180deg, #06080d 0%, #0a0e16 100%)',
              backgroundImage: `linear-gradient(rgba(14,165,233,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.03) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}>
              {(() => {
                const mainNodes = metro.nodes.filter(n => n.row === 'main')
                const branchNodes = metro.nodes.filter(n => n.row === 'branch')
                const totalStations = mainNodes.length
                const spacing = 80
                const width = Math.max(totalStations * spacing, 600)
                const mainY = 70
                const branchY = 150
                const hasBranch = branchNodes.length > 0
                const svgH = hasBranch ? 210 : 140

                // Position map: node index -> x coordinate
                const nodeX = (idx: number, row: 'main' | 'branch') => {
                  if (row === 'main') return 40 + idx * spacing
                  // Branch nodes: position between branch start and rejoin
                  const bStart = (metro.branchOffset !== undefined && mainNodes.length > 0)
                    ? Math.max(0, mainNodes.findIndex(n => !n.isOld && n.isCurrent) - 1) : 0
                  const bStartX = 40 + Math.max(0, bStart) * spacing
                  const bSpacing = branchNodes.length > 1 ? (spacing * (mainNodes.filter(n => n.isCurrent && !n.isOld).length + 1)) / (branchNodes.length + 1) : spacing
                  return bStartX + (idx + 1) * bSpacing
                }

                return (
                  <div className="p-6 pb-4 flex justify-center">
                    <svg width={width + 80} height={svgH} style={{ overflow: 'visible', flexShrink: 0 }}>
                      <defs>
                        <filter id="ng"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                        <filter id="ng2"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                        <style>{`
                          @keyframes dflow { to { stroke-dashoffset: -24; } }
                          .np-tip { pointer-events: none; opacity: 0; transition: opacity 0.15s; }
                          .np-nd:hover .np-tip { opacity: 1; }
                        `}</style>
                      </defs>

                      {/* Main line segments */}
                      {mainNodes.map((_, i) => {
                        if (i === 0) return null
                        const x1 = nodeX(i - 1, 'main')
                        const x2 = nodeX(i, 'main')
                        const hop = mainNodes[i].hop || mainNodes[i].oldHop
                        const color = hop ? rttColor(hop.rtt_ms) : '#0ea5e9'
                        const active = mainNodes[i].isCurrent
                        return (
                          <g key={`ml-${i}`}>
                            <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={color} strokeWidth={6} strokeOpacity={active ? 0.06 : 0.02} strokeLinecap="round" />
                            <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={color} strokeWidth={2} strokeOpacity={active ? 0.7 : 0.15} strokeLinecap="round" filter={active ? 'url(#ng)' : undefined} />
                            {active && <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={color} strokeWidth={2} strokeOpacity={0.4} strokeDasharray="2 22" strokeLinecap="round" style={{ animation: 'dflow 1.5s linear infinite' }} />}
                          </g>
                        )
                      })}

                      {/* Branch line segments */}
                      {branchNodes.map((_, i) => {
                        if (i === 0) return null
                        const x1 = nodeX(i - 1, 'branch')
                        const x2 = nodeX(i, 'branch')
                        return (
                          <line key={`bl-${i}`} x1={x1} y1={branchY} x2={x2} y2={branchY}
                            stroke="#7a8ba8" strokeWidth={1.5} strokeOpacity={0.2} strokeDasharray="4 4" strokeLinecap="round" />
                        )
                      })}

                      {/* Branch connections: fork down and rejoin up */}
                      {hasBranch && (() => {
                        // Find fork point (last common node before divergence)
                        let forkIdx = 0
                        for (let i = 0; i < mainNodes.length; i++) {
                          if (mainNodes[i].isOld && mainNodes[i].isCurrent) forkIdx = i
                          else break
                        }
                        // Find rejoin point
                        let rejoinIdx = mainNodes.length - 1
                        for (let i = mainNodes.length - 1; i >= 0; i--) {
                          if (mainNodes[i].isOld && mainNodes[i].isCurrent) { rejoinIdx = i; break }
                        }
                        const forkX = nodeX(forkIdx, 'main')
                        const rejoinX = nodeX(rejoinIdx, 'main')
                        const branchStartX = nodeX(0, 'branch')
                        const branchEndX = nodeX(branchNodes.length - 1, 'branch')
                        return (
                          <g>
                            {/* Fork curve */}
                            <path d={`M ${forkX} ${mainY} C ${forkX} ${mainY + 40} ${branchStartX} ${branchY - 40} ${branchStartX} ${branchY}`}
                              fill="none" stroke="#7a8ba8" strokeWidth={1.5} strokeOpacity={0.2} strokeDasharray="5 5" />
                            {/* Rejoin curve */}
                            <path d={`M ${branchEndX} ${branchY} C ${branchEndX} ${branchY - 40} ${rejoinX} ${mainY + 40} ${rejoinX} ${mainY}`}
                              fill="none" stroke="#7a8ba8" strokeWidth={1.5} strokeOpacity={0.2} strokeDasharray="5 5" />
                            {/* Label */}
                            <text x={(branchStartX + branchEndX) / 2} y={branchY + 30} textAnchor="middle" fontSize={8}
                              fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8" opacity={0.4} letterSpacing="1">
                              PREVIOUS ROUTE
                            </text>
                          </g>
                        )
                      })()}

                      {/* Main nodes */}
                      {mainNodes.map((node, i) => {
                        const x = nodeX(i, 'main')
                        const hop = node.hop || node.oldHop
                        if (!hop) return null
                        const isFirst = i === 0
                        const isLast = i === mainNodes.length - 1
                        const color = isFirst ? '#10b981' : isLast ? '#ef4444' : rttColor(hop.rtt_ms)
                        const active = node.isCurrent
                        const r = isFirst || isLast ? 14 : 11

                        return (
                          <g key={`mn-${i}`} className="np-nd" style={{ cursor: 'pointer' }}>
                            {active && <circle cx={x} cy={mainY} r={20} fill="none" stroke={color} strokeWidth={0.5} strokeOpacity={0.2}>
                              <animate attributeName="r" values="18;28;18" dur={`${2 + i * 0.15}s`} repeatCount="indefinite" />
                              <animate attributeName="stroke-opacity" values="0.2;0;0.2" dur={`${2 + i * 0.15}s`} repeatCount="indefinite" />
                            </circle>}
                            <circle cx={x} cy={mainY} r={r + 3} fill={color} fillOpacity={active ? 0.06 : 0.02} stroke={color} strokeWidth={0.5} strokeOpacity={active ? 0.2 : 0.1} />
                            <circle cx={x} cy={mainY} r={r} fill="#0a0e16" stroke={color} strokeWidth={active ? 2 : 1} strokeOpacity={active ? 1 : 0.3} filter={active ? 'url(#ng)' : undefined} />
                            <circle cx={x} cy={mainY} r={r - 3} fill={color} fillOpacity={active ? 0.3 : 0.1} />
                            {hop.rtt_ms > 0 && active && (
                              <text x={x} y={mainY + 4} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={color} fontWeight="bold">
                                {hop.rtt_ms < 10 ? hop.rtt_ms.toFixed(1) : Math.round(hop.rtt_ms)}
                              </text>
                            )}
                            {isFirst && <text x={x} y={mainY - 22} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#10b981" filter="url(#ng)" letterSpacing="2">SRC</text>}
                            {isLast && <text x={x} y={mainY - 22} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#ef4444" filter="url(#ng)" letterSpacing="2">DST</text>}
                            <text x={x} y={mainY + r + 16} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill={color} opacity={active ? 0.8 : 0.3}>
                              {hop.address || '*'}
                            </text>

                            {/* Tooltip on hover */}
                            <g className="np-tip">
                              <rect x={x - 85} y={mainY - 80} width={170} height={65} rx={8}
                                fill="#0b0f18" stroke={`${color}40`} strokeWidth={1} style={{ filter: `drop-shadow(0 0 10px ${color}20)` }} />
                              <text x={x} y={mainY - 62} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={color} fontWeight="600">
                                {isFirst ? 'Source' : isLast ? 'Destination' : `Hop ${hop.ttl + 1}`}
                              </text>
                              <text x={x} y={mainY - 49} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#0ea5e9">{hop.address}</text>
                              {hop.rtt_ms > 0 && <text x={x} y={mainY - 36} textAnchor="middle" fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill={rttColor(hop.rtt_ms)} fontWeight="bold">{hop.rtt_ms.toFixed(2)} ms</text>}
                              {hop.city && <text x={x} y={mainY - 23} textAnchor="middle" fontSize={7} fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8">{hop.city}{hop.country ? `, ${hop.country}` : ''} {hop.isp ? `· ${hop.isp.slice(0, 20)}` : ''}</text>}
                            </g>
                          </g>
                        )
                      })}

                      {/* Branch nodes (old route) */}
                      {branchNodes.map((node, i) => {
                        const x = nodeX(i, 'branch')
                        const hop = node.oldHop
                        if (!hop) return null
                        return (
                          <g key={`bn-${i}`} className="np-nd" style={{ cursor: 'pointer' }}>
                            <circle cx={x} cy={branchY} r={6} fill="#0a0e16" stroke="#7a8ba8" strokeWidth={1} strokeOpacity={0.3} />
                            <circle cx={x} cy={branchY} r={2} fill="#7a8ba8" fillOpacity={0.3} />
                            <text x={x} y={branchY + 16} textAnchor="middle" fontSize={7} fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8" opacity={0.4}>
                              {hop.address || '???'}
                            </text>
                            <g className="np-tip">
                              <rect x={x - 80} y={branchY - 50} width={160} height={40} rx={6}
                                fill="#0b0f18" stroke="#7a8ba840" strokeWidth={1} />
                              <text x={x} y={branchY - 34} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8">Old: {hop.address}</text>
                              {hop.rtt_ms > 0 && <text x={x} y={branchY - 20} textAnchor="middle" fontSize={8} fontFamily="'IBM Plex Mono',monospace" fill="#7a8ba8">{hop.rtt_ms.toFixed(2)} ms</text>}
                            </g>
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                )
              })()}
            </div>
            )}
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
