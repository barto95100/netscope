import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Scan } from '../api/client'

interface UseScanPollReturn {
  scan: Scan | null
  polling: boolean
  submitting: boolean
  error: string | null
  submit: (type: string, target: string, options?: Record<string, unknown>) => Promise<void>
  reset: () => void
}

export function useScanPoll(): UseScanPollReturn {
  const [scan, setScan] = useState<Scan | null>(null)
  const [polling, setPolling] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setPolling(false)
  }, [])

  const startPolling = useCallback(
    (id: string) => {
      setPolling(true)
      intervalRef.current = setInterval(async () => {
        try {
          const updated = await api.scans.get(id)
          setScan(updated)
          if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'cancelled') {
            stopPolling()
          }
        } catch (err) {
          console.error('Poll error:', err)
          stopPolling()
        }
      }, 1000)
    },
    [stopPolling],
  )

  const submit = useCallback(
    async (type: string, target: string, options?: Record<string, unknown>) => {
      setError(null)
      setScan(null)
      stopPolling()
      setSubmitting(true)

      try {
        const created = await api.scans.create({ type, target, options })
        setScan(created)
        startPolling(created.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
      } finally {
        setSubmitting(false)
      }
    },
    [startPolling, stopPolling],
  )

  const reset = useCallback(() => {
    stopPolling()
    setScan(null)
    setError(null)
    setSubmitting(false)
  }, [stopPolling])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return { scan, polling, submitting, error, submit, reset }
}
