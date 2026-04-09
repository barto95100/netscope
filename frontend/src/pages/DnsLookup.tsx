import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

const recordTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA']

interface DnsRecord {
  type: string
  name: string
  value: string
  ttl?: number
  priority?: number
}

interface DnsResult {
  records?: DnsRecord[]
  [key: string]: unknown
}

export function DnsLookup() {
  const [target, setTarget] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['A', 'AAAA', 'MX'])
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const toggleType = (t: string) => {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('dns', target.trim(), { types: selectedTypes })
  }

  const result = scan?.result as DnsResult | null
  const records = result?.records ?? []

  return (
    <ToolPage
      title="DNS Lookup"
      description="Query DNS records for a domain across multiple record types"
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
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                DNS Records
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
                {records.length} record{records.length !== 1 ? 's' : ''}
              </span>
            </div>

            {records.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: 'var(--font-family-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Type', 'Name', 'Value', 'TTL'].map((col) => (
                        <th key={col} className="px-4 py-2 text-left font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ color: 'var(--color-accent)', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}
                          >
                            {r.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{r.name}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-primary)', maxWidth: '300px', wordBreak: 'break-all' }}>{r.value}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{r.ttl ?? '-'}</td>
                      </tr>
                    ))}
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
        <div>
          <label
            className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
          >
            Domain
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. example.com"
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
            className="block text-xs font-medium mb-2 uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
          >
            Record Types
          </label>
          <div className="flex flex-wrap gap-2">
            {recordTypes.map((t) => {
              const active = selectedTypes.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className="px-3 py-1 rounded text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'rgba(14,165,233,0.15)' : 'var(--color-bg-elevated)',
                    border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-family-mono)',
                  }}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={submitting || polling || selectedTypes.length === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{
              background: 'linear-gradient(to right, var(--color-accent), #0284c7)',
              opacity: submitting || polling || selectedTypes.length === 0 ? 0.6 : 1,
              fontFamily: 'var(--font-family-heading)',
            }}
          >
            {submitting ? 'Starting...' : polling ? 'Looking up...' : 'Lookup DNS'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
