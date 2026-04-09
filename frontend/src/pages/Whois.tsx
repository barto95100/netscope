import { type FormEvent, useState } from 'react'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

interface WhoisResult {
  domain?: string
  registrar?: string
  created_at?: string
  expires_at?: string
  updated_at?: string
  name_servers?: string[]
  raw_text?: string
  [key: string]: unknown
}

export function Whois() {
  const [target, setTarget] = useState('')
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('whois', target.trim())
  }

  const result = (scan?.result ?? null) as WhoisResult | null

  const Field = ({ label, value }: { label: string; value: string | undefined }) =>
    value ? (
      <div className="flex gap-4 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-xs w-28 shrink-0 pt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
          {label}
        </span>
        <span className="text-sm break-all" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
          {value}
        </span>
      </div>
    ) : null

  return (
    <ToolPage
      title="Whois Lookup"
      description="Query WHOIS databases for domain registration information"
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
                Whois Data
              </span>
            </div>
            <div className="px-4 py-2">
              {result?.domain || result?.registrar || result?.created_at ? (
                <>
                  <Field label="Domain" value={result?.domain} />
                  <Field label="Registrar" value={result?.registrar} />
                  <Field label="Created" value={result?.created_at} />
                  <Field label="Expires" value={result?.expires_at} />
                  <Field label="Updated" value={result?.updated_at} />
                  {result?.name_servers && (
                    <Field label="Name Servers" value={result.name_servers.join(', ')} />
                  )}
                </>
              ) : (
                <pre className="py-3 text-xs overflow-x-auto" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)', lineHeight: 1.6 }}>
                  {result?.raw_text ?? JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
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
            Domain / IP
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. example.com or 8.8.8.8"
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
            {submitting ? 'Starting...' : polling ? 'Looking up...' : 'Whois Lookup'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
