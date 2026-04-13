import { useState } from 'react'
import { api, type Scan } from '../api/client'

interface VulnFinding {
  id: string
  severity: string
  category: string
  title: string
  description: string
  remediation?: string
  evidence?: string
  url?: string
  exploit_available: boolean
  exploit_type?: string
}

interface ModuleResult {
  name: string
  status: string
  duration_sec: number
  findings: number
  error?: string
}

interface VulnResult {
  target: string
  grade: string
  summary: { critical: number; high: number; medium: number; low: number; info: number; total: number }
  findings: VulnFinding[]
  modules: ModuleResult[]
  duration_sec: number
}

interface ExploitResult {
  finding_id: string
  exploit_type: string
  success: boolean
  severity: string
  title: string
  details: string
  evidence: string[]
  remediation: string
}

interface ModuleProgress {
  module: string
  index: number
  total: number
  status: string
  findings: number
  duration_sec: number
}

interface PentestResult {
  target: string
  verdict: string
  summary: { exploited: number; vulnerable: number; safe: number; total: number }
  modules: PentestModuleResult[]
  duration_sec: number
}

interface PentestModuleResult {
  name: string
  status: string
  duration_sec: number
  findings: PentestFinding[]
}

interface PentestFinding {
  title: string
  severity: string
  success: boolean
  details: string
  evidence?: string[]
  remediation?: string
}

const sevColor: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#0ea5e9',
  info: '#7a8ba8',
}

const sevBg: Record<string, string> = {
  critical: 'rgba(239,68,68,0.1)',
  high: 'rgba(249,115,22,0.1)',
  medium: 'rgba(234,179,8,0.1)',
  low: 'rgba(14,165,233,0.1)',
  info: 'rgba(122,139,168,0.1)',
}

const gradeColor: Record<string, string> = {
  A: '#10b981', B: '#10b981', C: '#eab308', D: '#f97316', F: '#ef4444',
}

const catLabel: Record<string, string> = {
  sensitive_files: 'Sensitive Files',
  cors: 'CORS',
  cookies: 'Cookies',
  info_disclosure: 'Info Disclosure',
  dns_security: 'DNS Security',
  http_methods: 'HTTP Methods',
  dir_listing: 'Dir Listing',
  open_redirect: 'Open Redirect',
  subdomains: 'Subdomains',
  waf: 'WAF',
  banner: 'Banners',
  sqli: 'SQL Injection',
  xss: 'XSS',
  ssrf: 'SSRF',
  api_discovery: 'API Discovery',
}

const catIcon: Record<string, string> = {
  sensitive_files: '📁',
  cors: '🔗',
  cookies: '🍪',
  info_disclosure: '💬',
  dns_security: '🌐',
  http_methods: '📡',
  dir_listing: '📂',
  open_redirect: '↪',
  subdomains: '🔍',
  waf: '🛡',
  banner: '🏷',
  sqli: '💉',
  xss: '⚡',
  ssrf: '🎯',
  api_discovery: '🔌',
}

export function VulnScanner() {
  const [target, setTarget] = useState('')
  const [scan, setScan] = useState<Scan | null>(null)
  const [loading, setLoading] = useState(false)
  const [exploitResults, setExploitResults] = useState<Record<string, ExploitResult>>({})
  const [exploitLoading, setExploitLoading] = useState<Record<string, boolean>>({})
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({})
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [timeoutSec, setTimeoutSec] = useState(180)
  const [moduleProgress, setModuleProgress] = useState<ModuleProgress[]>([])
  const [pentestScan, setPentestScan] = useState<Scan | null>(null)
  const [pentestLoading, setPentestLoading] = useState(false)
  const [pentestProgress, setPentestProgress] = useState<ModuleProgress[]>([])
  const [pentestTimeout, setPentestTimeout] = useState(300)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setScan(null)
    setExploitResults({})
    setExploitLoading({})
    setExpandedFindings({})
    setActiveCategory(null)
    setModuleProgress([])
    setPentestScan(null)
    setPentestLoading(false)
    setPentestProgress([])
    try {
      const s = await api.scans.create({ type: 'vulnscan', target, options: { timeout_sec: timeoutSec } })
      setScan(s)

      // Connect WebSocket for real-time progress
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/scans/${s.id}`)

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.status === 'progress' && msg.data) {
          const progress: ModuleProgress = JSON.parse(typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data))
          setModuleProgress(prev => [...prev, progress])
        } else if (msg.status === 'completed' || msg.status === 'failed') {
          // Fetch final result from API
          api.scans.get(s.id).then(updated => {
            setScan(updated)
            setLoading(false)
          })
          ws.close()
        }
      }

      ws.onerror = () => {
        // Fallback to polling if WebSocket fails
        const poll = setInterval(async () => {
          const updated = await api.scans.get(s.id)
          setScan(updated)
          if (updated.status === 'completed' || updated.status === 'failed') {
            clearInterval(poll)
            setLoading(false)
          }
        }, 2000)
        ws.close()
      }
    } catch {
      setLoading(false)
    }
  }

  async function handleExploit(finding: VulnFinding) {
    if (!finding.exploit_type) return
    setExploitLoading(prev => ({ ...prev, [finding.id]: true }))
    try {
      const s = await api.scans.create({
        type: 'vulnexploit',
        target: result?.target || target,
        options: {
          exploit_type: finding.exploit_type,
          url: finding.url || '',
          target: result?.target || target,
          finding_id: finding.id,
        },
      })
      // Poll for result
      const poll = setInterval(async () => {
        const updated = await api.scans.get(s.id)
        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(poll)
          if (updated.result) {
            setExploitResults(prev => ({ ...prev, [finding.id]: updated.result as unknown as ExploitResult }))
          }
          setExploitLoading(prev => ({ ...prev, [finding.id]: false }))
        }
      }, 1500)
    } catch {
      setExploitLoading(prev => ({ ...prev, [finding.id]: false }))
    }
  }

  async function handlePentest() {
    if (!result) return
    setPentestLoading(true)
    setPentestScan(null)
    setPentestProgress([])
    try {
      const s = await api.scans.create({
        type: 'pentest',
        target: result.target,
        options: {
          timeout_sec: pentestTimeout,
          findings: result.findings,
        },
      })
      setPentestScan(s)

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/scans/${s.id}`)

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.status === 'progress' && msg.data) {
          const progress: ModuleProgress = JSON.parse(typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data))
          setPentestProgress(prev => [...prev, progress])
        } else if (msg.status === 'completed' || msg.status === 'failed') {
          api.scans.get(s.id).then(updated => {
            setPentestScan(updated)
            setPentestLoading(false)
          })
          ws.close()
        }
      }

      ws.onerror = () => {
        const poll = setInterval(async () => {
          const updated = await api.scans.get(s.id)
          setPentestScan(updated)
          if (updated.status === 'completed' || updated.status === 'failed') {
            clearInterval(poll)
            setPentestLoading(false)
          }
        }, 2000)
        ws.close()
      }
    } catch {
      setPentestLoading(false)
    }
  }

  const result = scan?.result as unknown as VulnResult | null

  // Group findings by category
  const findingsByCategory: Record<string, VulnFinding[]> = {}
  if (result) {
    for (const f of result.findings) {
      if (!findingsByCategory[f.category]) findingsByCategory[f.category] = []
      findingsByCategory[f.category].push(f)
    }
  }

  // Sort categories by highest severity finding
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const sortedCategories = Object.keys(findingsByCategory).sort((a, b) => {
    const maxA = Math.min(...findingsByCategory[a].map(f => sevOrder[f.severity as keyof typeof sevOrder] ?? 5))
    const maxB = Math.min(...findingsByCategory[b].map(f => sevOrder[f.severity as keyof typeof sevOrder] ?? 5))
    return maxA - maxB
  })

  const filteredCategories = activeCategory ? [activeCategory] : sortedCategories

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
          Vulnerability Scanner
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          15-module security audit — sensitive files, injection, CORS, DNS, subdomains, banners & more
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <input value={target} onChange={(e) => setTarget(e.target.value)}
          placeholder="Target domain (e.g. example.com)"
          className="flex-1 px-4 py-2.5 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }} />
        <select value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))}
          className="px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
          <option value={60}>1 min</option>
          <option value={180}>3 min</option>
          <option value={300}>5 min</option>
          <option value={600}>10 min</option>
        </select>
        <button type="submit" disabled={loading || !target}
          className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
          {loading ? 'Scanning...' : 'Launch Scan'}
        </button>
      </form>

      {/* Scanning progress */}
      {(scan?.status === 'running' || scan?.status === 'pending') && (
        <div className="rounded-xl p-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
            <span className="text-sm font-medium" style={{ color: '#ef4444', fontFamily: 'var(--font-family-mono)' }}>
              SCANNING {target.toUpperCase()}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
              {moduleProgress.length}{moduleProgress.length > 0 ? `/${moduleProgress[0].total}` : ''} modules
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full mb-4" style={{ background: 'var(--color-bg-surface)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{
              width: `${moduleProgress.length > 0 ? (moduleProgress.length / moduleProgress[0].total) * 100 : 0}%`,
              background: 'linear-gradient(90deg, #ef4444, #f97316)',
            }} />
          </div>

          {/* Module list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {/* Completed modules */}
            {moduleProgress.map((p) => (
              <div key={p.module} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{
                background: 'rgba(16,185,129,0.06)',
                border: '1px solid rgba(16,185,129,0.2)',
                color: '#10b981',
                fontFamily: 'var(--font-family-mono)',
              }}>
                ✓
                <span className="truncate">{p.module}</span>
                {p.findings > 0 && (
                  <span className="ml-auto shrink-0 px-1.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    {p.findings}
                  </span>
                )}
              </div>
            ))}
            {/* Currently running module (spinner) */}
            {moduleProgress.length > 0 && moduleProgress.length < moduleProgress[0].total && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444',
                fontFamily: 'var(--font-family-mono)',
              }}>
                <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: '#ef4444', borderTopColor: 'transparent' }} />
                <span className="truncate">Running...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {scan?.status === 'failed' && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)' }}>
          {scan.error ?? 'Scan failed'}
        </div>
      )}

      {result && scan?.status === 'completed' && (
        <div className="space-y-4">
          {/* Grade + Summary */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0" style={{
                background: `${gradeColor[result.grade] || '#7a8ba8'}15`,
                border: `2px solid ${gradeColor[result.grade] || '#7a8ba8'}40`,
              }}>
                <span className="text-5xl font-bold" style={{ fontFamily: 'var(--font-family-heading)', color: gradeColor[result.grade] }}>
                  {result.grade}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
                    {result.target}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                    {result.duration_sec.toFixed(1)}s
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                    {result.modules.length} modules
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(['critical', 'high', 'medium', 'low', 'info'] as const).map(sev => {
                    const count = result.summary[sev]
                    if (count === 0) return null
                    return (
                      <div key={sev} className="flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ background: sevBg[sev] }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: sevColor[sev] }} />
                        <span className="text-xs font-bold" style={{ color: sevColor[sev], fontFamily: 'var(--font-family-mono)' }}>
                          {count}
                        </span>
                        <span className="text-[10px] uppercase" style={{ color: sevColor[sev] }}>{sev}</span>
                      </div>
                    )
                  })}
                  {result.summary.total === 0 && (
                    <span className="text-xs" style={{ color: 'var(--color-green)' }}>No vulnerabilities found</span>
                  )}
                </div>
              </div>
            </div>

            {/* Module status bar */}
            <div className="mt-4 flex gap-1 flex-wrap">
              {result.modules.map((m, i) => {
                const hasFindings = m.findings > 0
                return (
                  <div key={i} className="text-[9px] px-2 py-1 rounded flex items-center gap-1" style={{
                    background: hasFindings ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                    color: hasFindings ? '#ef4444' : '#10b981',
                    fontFamily: 'var(--font-family-mono)',
                  }} title={`${m.name}: ${m.findings} findings in ${m.duration_sec.toFixed(1)}s`}>
                    <span>{hasFindings ? '⚠' : '✓'}</span>
                    <span>{m.name}</span>
                    {hasFindings && <span className="font-bold">({m.findings})</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Category filter pills */}
          {sortedCategories.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setActiveCategory(null)}
                className="text-[10px] px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: !activeCategory ? 'rgba(14,165,233,0.15)' : 'var(--color-bg-card)',
                  border: `1px solid ${!activeCategory ? 'rgba(14,165,233,0.3)' : 'var(--color-border)'}`,
                  color: !activeCategory ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}>
                All ({result.findings.length})
              </button>
              {sortedCategories.map(cat => {
                const catFindings = findingsByCategory[cat]
                const maxSev = catFindings.reduce((max, f) => {
                  const o = sevOrder[f.severity as keyof typeof sevOrder] ?? 5
                  return o < max ? o : max
                }, 5)
                const maxSevName = Object.entries(sevOrder).find(([, v]) => v === maxSev)?.[0] || 'info'
                return (
                  <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                    className="text-[10px] px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5"
                    style={{
                      background: activeCategory === cat ? sevBg[maxSevName] : 'var(--color-bg-card)',
                      border: `1px solid ${activeCategory === cat ? sevColor[maxSevName] + '40' : 'var(--color-border)'}`,
                      color: activeCategory === cat ? sevColor[maxSevName] : 'var(--color-text-tertiary)',
                    }}>
                    <span>{catIcon[cat] || '•'}</span>
                    <span>{catLabel[cat] || cat}</span>
                    <span className="font-bold">({catFindings.length})</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Findings by category */}
          {filteredCategories.map(cat => {
            const catFindings = findingsByCategory[cat]
            if (!catFindings) return null
            return (
              <div key={cat} className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span>{catIcon[cat] || '•'}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                    {catLabel[cat] || cat}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                    {catFindings.length}
                  </span>
                </div>
                {catFindings.map((f) => {
                  const isExpanded = expandedFindings[f.id]
                  const exploitResult = exploitResults[f.id]
                  const isExploiting = exploitLoading[f.id]

                  return (
                    <div key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-[rgba(255,255,255,0.02)]"
                        onClick={() => setExpandedFindings(prev => ({ ...prev, [f.id]: !prev[f.id] }))}>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase shrink-0 mt-0.5" style={{
                          background: sevBg[f.severity],
                          color: sevColor[f.severity],
                          fontFamily: 'var(--font-family-mono)',
                          minWidth: '60px',
                          textAlign: 'center',
                        }}>
                          {f.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{f.title}</div>
                          {!isExpanded && (
                            <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>{f.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {f.exploit_available && !exploitResult && (
                            <button
                              onClick={e => { e.stopPropagation(); handleExploit(f) }}
                              disabled={isExploiting}
                              className="text-[10px] px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider disabled:opacity-50 transition-all"
                              style={{
                                background: isExploiting ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                color: '#ef4444',
                              }}>
                              {isExploiting ? '⏳ Running...' : '⚡ Exploit'}
                            </button>
                          )}
                          {exploitResult && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{
                              background: exploitResult.success ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                              color: exploitResult.success ? '#ef4444' : '#10b981',
                            }}>
                              {exploitResult.success ? '💀 EXPLOITED' : '🛡 SAFE'}
                            </span>
                          )}
                          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-2" style={{ marginLeft: '72px' }}>
                          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{f.description}</div>
                          {f.url && (
                            <div className="text-[11px]" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-accent)' }}>
                              URL: {f.url}
                            </div>
                          )}
                          {f.evidence && (
                            <div className="text-[11px] p-2 rounded" style={{
                              background: 'var(--color-bg-surface)',
                              fontFamily: 'var(--font-family-mono)',
                              color: 'var(--color-text-secondary)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}>
                              {f.evidence}
                            </div>
                          )}
                          {f.remediation && (
                            <div className="text-xs flex items-start gap-1.5">
                              <span style={{ color: '#10b981' }}>Fix:</span>
                              <span style={{ color: 'var(--color-text-secondary)' }}>{f.remediation}</span>
                            </div>
                          )}

                          {/* Exploit result */}
                          {exploitResult && (
                            <div className="mt-2 rounded-lg p-3 space-y-2" style={{
                              background: exploitResult.success ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)',
                              border: `1px solid ${exploitResult.success ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                            }}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold" style={{ color: exploitResult.success ? '#ef4444' : '#10b981' }}>
                                  {exploitResult.success ? '⚠ EXPLOITATION SUCCESSFUL' : '✓ Not exploitable'}
                                </span>
                                {exploitResult.severity && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{
                                    background: sevBg[exploitResult.severity],
                                    color: sevColor[exploitResult.severity],
                                  }}>
                                    {exploitResult.severity}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                {exploitResult.details}
                              </div>
                              {exploitResult.evidence && exploitResult.evidence.length > 0 && (
                                <div className="text-[11px] p-2 rounded space-y-1" style={{
                                  background: 'var(--color-bg-surface)',
                                  fontFamily: 'var(--font-family-mono)',
                                  color: exploitResult.success ? '#ef4444' : 'var(--color-text-secondary)',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                }}>
                                  {exploitResult.evidence.map((e, i) => (
                                    <div key={i}>{e}</div>
                                  ))}
                                </div>
                              )}
                              {exploitResult.remediation && (
                                <div className="text-xs flex items-start gap-1.5">
                                  <span style={{ color: '#10b981' }}>Fix:</span>
                                  <span style={{ color: 'var(--color-text-secondary)' }}>{exploitResult.remediation}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Pentest Section */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            {!pentestScan && !pentestLoading && (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-heading)' }}>
                    Penetration Test
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    6 modules — brute-force, fuzzing, path traversal, auth bypass, upload test, CVE exploitation
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select value={pentestTimeout} onChange={(e) => setPentestTimeout(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                    <option value={300}>5 min</option>
                    <option value={600}>10 min</option>
                    <option value={1800}>30 min</option>
                  </select>
                  <button onClick={handlePentest}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)' }}>
                    Launch Pentest
                  </button>
                </div>
              </div>
            )}

            {pentestLoading && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#dc2626' }} />
                  <span className="text-sm font-medium" style={{ color: '#dc2626', fontFamily: 'var(--font-family-mono)' }}>
                    PENTESTING {result.target.toUpperCase()}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                    {pentestProgress.length}/6 modules
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full mb-4" style={{ background: 'var(--color-bg-surface)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{
                    width: `${(pentestProgress.length / 6) * 100}%`,
                    background: 'linear-gradient(90deg, #dc2626, #991b1b)',
                  }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {['Login Brute-force', 'Parameter Fuzzing', 'Path Traversal', 'Auth Bypass', 'File Upload Test', 'CVE Exploitation'].map((name, i) => {
                    const done = pentestProgress.find(p => p.module === name)
                    const isRunning = !done && pentestProgress.length === i
                    return (
                      <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{
                        background: done ? (done.status === 'exploited' ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)') : isRunning ? 'rgba(239,68,68,0.06)' : 'transparent',
                        border: `1px solid ${done ? (done.status === 'exploited' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)') : isRunning ? 'rgba(239,68,68,0.2)' : 'var(--color-border)'}`,
                        color: done ? (done.status === 'exploited' ? '#ef4444' : '#10b981') : isRunning ? '#ef4444' : 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-family-mono)',
                      }}>
                        {done ? (done.status === 'exploited' ? '!!' : '✓') : isRunning ? (
                          <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: '#ef4444', borderTopColor: 'transparent' }} />
                        ) : '○'}
                        <span className="truncate">{name}</span>
                        {done && done.findings > 0 && (
                          <span className="ml-auto shrink-0 px-1.5 rounded" style={{
                            background: done.status === 'exploited' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                            color: done.status === 'exploited' ? '#ef4444' : '#10b981',
                          }}>{done.findings}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {pentestScan?.status === 'completed' && pentestScan.result && (() => {
              const pr = pentestScan.result as unknown as PentestResult
              const verdictColor = pr.verdict === 'COMPROMISED' ? '#ef4444' : pr.verdict === 'VULNERABLE' ? '#f97316' : '#10b981'
              return (
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="px-4 py-2 rounded-lg font-bold text-lg" style={{
                      background: verdictColor + '15',
                      border: `2px solid ${verdictColor}40`,
                      color: verdictColor,
                      fontFamily: 'var(--font-family-heading)',
                    }}>{pr.verdict}</div>
                    <div className="flex gap-3 text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                      {pr.summary.exploited > 0 && <span style={{ color: '#ef4444' }}>{pr.summary.exploited} exploited</span>}
                      {pr.summary.vulnerable > 0 && <span style={{ color: '#f97316' }}>{pr.summary.vulnerable} vulnerable</span>}
                      <span style={{ color: '#10b981' }}>{pr.summary.safe} safe</span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{pr.duration_sec.toFixed(1)}s</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {pr.modules.map((m) => (
                      <div key={m.name} className="rounded-lg p-3" style={{
                        background: m.status === 'exploited' ? 'rgba(239,68,68,0.04)' : m.status === 'vulnerable' ? 'rgba(249,115,22,0.04)' : 'rgba(16,185,129,0.04)',
                        border: `1px solid ${m.status === 'exploited' ? 'rgba(239,68,68,0.15)' : m.status === 'vulnerable' ? 'rgba(249,115,22,0.15)' : 'rgba(16,185,129,0.15)'}`,
                      }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span style={{ color: m.status === 'exploited' ? '#ef4444' : m.status === 'vulnerable' ? '#f97316' : '#10b981' }}>
                            {m.status === 'exploited' ? '!!' : m.status === 'vulnerable' ? '!!' : '✓'}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>{m.name}</span>
                          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{m.duration_sec.toFixed(1)}s</span>
                        </div>
                        {m.findings.map((f, fi) => (
                          <div key={fi} className="ml-5 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs" style={{ color: f.success ? '#ef4444' : '#10b981' }}>{f.success ? '✗' : '✓'}</span>
                              <span className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{f.title}</span>
                              {f.severity && <span className="text-[10px] px-1.5 rounded" style={{ background: f.severity === 'critical' ? 'rgba(239,68,68,0.1)' : f.severity === 'high' ? 'rgba(249,115,22,0.1)' : 'rgba(234,179,8,0.1)', color: f.severity === 'critical' ? '#ef4444' : f.severity === 'high' ? '#f97316' : '#eab308' }}>{f.severity}</span>}
                            </div>
                            {f.details && <p className="text-[11px] ml-5 mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{f.details}</p>}
                            {f.evidence && f.evidence.length > 0 && (
                              <div className="ml-5 mt-1 px-2 py-1 rounded text-[10px]" style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono)' }}>
                                {f.evidence.map((e, ei) => <div key={ei}>{e}</div>)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
