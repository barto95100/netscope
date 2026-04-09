import { useEffect, useRef, useState } from 'react'

interface WebSocketData {
  type: string
  data: unknown
}

interface UseWebSocketReturn {
  data: WebSocketData | null
  connected: boolean
}

export function useWebSocket(scanId: string | null): UseWebSocketReturn {
  const [data, setData] = useState<WebSocketData | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!scanId) {
      // Clean up any existing connection
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        setConnected(false)
        setData(null)
      }
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/api/ws/scans/${scanId}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as WebSocketData
        setData(parsed)
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      setConnected(false)
    }

    ws.onclose = () => {
      setConnected(false)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [scanId])

  return { data, connected }
}
