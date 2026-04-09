export function Certificates() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}>
        Certificate Monitoring
      </h1>
      <div className="rounded-xl p-12 text-center" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Certificate monitoring coming soon</p>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>Use SSL/TLS Audit to check certificates manually</p>
      </div>
    </div>
  )
}
