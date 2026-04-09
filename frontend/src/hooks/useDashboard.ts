import { useCallback, useEffect, useState } from 'react'
import { api, type DashboardStats } from '../api/client'

interface UseDashboardReturn {
  stats: DashboardStats | null
  loading: boolean
  refresh: () => void
}

export function useDashboard(): UseDashboardReturn {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.dashboard.stats()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    // Auto-refresh every 10 seconds
    const interval = setInterval(refresh, 10_000)
    return () => clearInterval(interval)
  }, [refresh])

  return { stats, loading, refresh }
}
