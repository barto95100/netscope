import { Link } from 'react-router-dom'
import { AlertRow } from '../components/AlertRow'
import { ScanRow } from '../components/ScanRow'
import { StatCard } from '../components/StatCard'
import { useDashboard } from '../hooks/useDashboard'

export function Dashboard() {
  const { stats, loading, refresh } = useDashboard()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}
          >
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Network diagnostics overview
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-hover)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Scans"
              value={stats?.total_scans ?? 0}
              sub="all time"
              color="blue"
            />
            <StatCard
              label="Active Monitors"
              value={stats?.active_monitors ?? 0}
              sub="currently running"
              color="green"
            />
            <StatCard
              label="Open Alerts"
              value={stats?.open_alerts ?? 0}
              sub="need attention"
              color="yellow"
            />
            <StatCard
              label="Critical Alerts"
              value={stats?.critical_alerts ?? 0}
              sub="high severity"
              color="red"
            />
          </div>

          {/* Bottom panels */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Recent Scans */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <h2
                  className="text-sm font-semibold"
                  style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}
                >
                  Recent Scans
                </h2>
                <Link
                  to="/history"
                  className="text-xs"
                  style={{ color: 'var(--color-accent)' }}
                >
                  View all →
                </Link>
              </div>

              {!stats?.recent_scans || stats.recent_scans.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  No recent scans
                </div>
              ) : (
                <div>
                  {stats.recent_scans.map((scan) => (
                    <ScanRow key={scan.id} scan={scan} />
                  ))}
                </div>
              )}
            </div>

            {/* Active Alerts */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <h2
                  className="text-sm font-semibold"
                  style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}
                >
                  Active Alerts
                </h2>
                <Link
                  to="/alerts"
                  className="text-xs"
                  style={{ color: 'var(--color-accent)' }}
                >
                  View all →
                </Link>
              </div>

              {!stats?.active_alerts || stats.active_alerts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  No active alerts
                </div>
              ) : (
                <div>
                  {stats.active_alerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
