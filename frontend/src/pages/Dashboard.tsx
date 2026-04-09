import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Scan, type Alert } from '../api/client'
import { AlertRow } from '../components/AlertRow'
import { ScanRow } from '../components/ScanRow'
import { StatCard } from '../components/StatCard'
import { useDashboard } from '../hooks/useDashboard'

export function Dashboard() {
  const { stats, loading, refresh } = useDashboard()
  const [scans, setScans] = useState<Scan[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    api.scans.list({ limit: 5 }).then(setScans).catch(() => {})
    api.alerts.list({ status: 'active' }).then(setAlerts).catch(() => {})
  }, [stats])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}
          >
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Real-time network &amp; security overview
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Monitored Hosts"
              value={stats?.monitored_hosts ?? 0}
              sub={`${stats?.running_scans ?? 0} scans running`}
              color="green"
            />
            <StatCard
              label="Scans Today"
              value={stats?.scans_today ?? 0}
              sub="since midnight"
              color="blue"
            />
            <StatCard
              label="Active Alerts"
              value={stats?.active_alerts ?? 0}
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
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
                <Link to="/history" className="text-xs" style={{ color: 'var(--color-accent)' }}>
                  View all →
                </Link>
              </div>
              {scans.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  No recent scans
                </div>
              ) : (
                <div>{scans.map((scan) => <ScanRow key={scan.id} scan={scan} />)}</div>
              )}
            </div>

            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
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
                <Link to="/alerts" className="text-xs" style={{ color: 'var(--color-accent)' }}>
                  View all →
                </Link>
              </div>
              {alerts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  No active alerts
                </div>
              ) : (
                <div>{alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
