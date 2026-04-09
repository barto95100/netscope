import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

const profiles = [
  { value: 'quick', label: 'Quick (top 100 ports)' },
  { value: 'standard', label: 'Standard (top 1000 ports)' },
  { value: 'full', label: 'Full (all 65535 ports)' },
]

interface PortResult {
  port: number
  protocol: string
  state: string
  service?: string
  version?: string
}

interface ScanResult {
  ports?: PortResult[]
  [key: string]: unknown
}

export function PortScanner() {
  const [target, setTarget] = useState('')
  const [profile, setProfile] = useState('quick')
  const [detectServices, setDetectServices] = useState(true)
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('port_scan', target.trim(), {
      profile,
      detect_services: detectServices,
    })
  }

  const result = scan?.result as ScanResult | null
  const ports = result?.ports ?? []

  const stateColor = (state: string) => {
    if (state === 'open') return 'var(--color-green)'
    if (state === 'filtered') return 'var(--color-yellow)'
    return 'var(--color-text-tertiary)'
  }

  return (
    <ToolPage
      title="Port Scanner"
      description="Scan TCP/UDP ports on a target host to identify open services"
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
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
              >
                Port Results
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                {ports.length} port{ports.length !== 1 ? 's' : ''}
              </span>
            </div>

            {ports.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Port', 'Protocol', 'State', 'Service', 'Version'].map((col) => (
                        <th
                          key={col}
                          className="px-4 py-2 text-left font-medium uppercase tracking-wide"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ports.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-accent)' }}>{p.port}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{p.protocol}</td>
                        <td className="px-4 py-2.5">
                          <span style={{ color: stateColor(p.state) }}>{p.state}</span>
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-primary)' }}>{p.service ?? '-'}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{p.version ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre
                className="p-4 text-xs overflow-x-auto"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)', lineHeight: 1.6 }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        ) : scan?.status === 'failed' ? (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'var(--color-red)',
              fontFamily: 'var(--font-family-mono)',
            }}
          >
            {scan.error ?? 'Scan failed'}
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
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
              placeholder="e.g. 192.168.1.1 or example.com"
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
              Scan Profile
            </label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-family-mono)',
              }}
            >
              {profiles.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="detect-services"
            checked={detectServices}
            onChange={(e) => setDetectServices(e.target.checked)}
            className="w-4 h-4 rounded"
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <label
            htmlFor="detect-services"
            className="text-sm"
            style={{ color: 'var(--color-text-secondary)', cursor: 'pointer' }}
          >
            Detect services and versions
          </label>
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
            {submitting ? 'Starting...' : polling ? 'Scanning...' : 'Start Scan'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
