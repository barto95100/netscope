import { useCallback, useEffect, useState } from 'react'
import { api, type CreateScanRequest, type Scan } from '../api/client'

interface UseScansReturn {
  scans: Scan[]
  loading: boolean
  refresh: () => void
  createScan: (data: CreateScanRequest) => Promise<Scan>
}

export function useScans(): UseScansReturn {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.scans.list({ limit: 50 })
      setScans(data ?? [])
    } catch (err) {
      console.error('Failed to fetch scans:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createScan = useCallback(async (data: CreateScanRequest): Promise<Scan> => {
    const scan = await api.scans.create(data)
    // Optimistically add to list
    setScans((prev) => [scan, ...prev])
    return scan
  }, [])

  return { scans, loading, refresh, createScan }
}
