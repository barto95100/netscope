// Types matching Go structs

export interface Scan {
  id: string
  type: string
  status: string
  target: string
  options: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface Monitor {
  id: string
  name: string
  type: string
  target: string
  interval_sec: number
  options: Record<string, unknown>
  enabled: boolean
  last_status: string
  last_checked_at: string | null
  last_latency_ms: number | null
  created_at: string
}

export interface Alert {
  id: string
  monitor_id: string | null
  scan_id: string | null
  severity: string
  title: string
  message: string | null
  status: string
  resolved_at: string | null
  created_at: string
}

export interface DashboardStats {
  monitored_hosts: number
  scans_today: number
  running_scans: number
  active_alerts: number
  critical_alerts: number
}

export interface CreateScanRequest {
  type: string
  target: string
  options?: Record<string, unknown>
}

export interface CreateMonitorRequest {
  name: string
  type: string
  target: string
  interval_sec: number
  options?: Record<string, unknown>
}

export interface UpdateMonitorRequest {
  name: string
  target: string
  interval_sec: number
  options?: Record<string, unknown>
  enabled: boolean
}

export interface UpdateAlertRequest {
  status: string
}

export interface Wordlist {
  id: string
  name: string
  type: string
  entry_count: number
  created_at: string
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body.error) msg = body.error
    } catch {
      // ignore parse error
    }
    throw new ApiError(res.status, msg)
  }

  // Some endpoints return no body (204)
  if (res.status === 204) {
    return undefined as unknown as T
  }

  return res.json() as Promise<T>
}

export const api = {
  scans: {
    create: (data: CreateScanRequest) =>
      request<Scan>('/api/scans', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    list: (params?: { type?: string; status?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.type) q.set('type', params.type)
      if (params?.status) q.set('status', params.status)
      if (params?.limit !== undefined) q.set('limit', String(params.limit))
      if (params?.offset !== undefined) q.set('offset', String(params.offset))
      const qs = q.toString()
      return request<Scan[]>(`/api/scans${qs ? `?${qs}` : ''}`)
    },

    get: (id: string) => request<Scan>(`/api/scans/${id}`),

    cancel: (id: string) =>
      request<void>(`/api/scans/${id}`, { method: 'DELETE' }),
  },

  monitors: {
    create: (data: CreateMonitorRequest) =>
      request<Monitor>('/api/monitors', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    list: (params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.limit !== undefined) q.set('limit', String(params.limit))
      if (params?.offset !== undefined) q.set('offset', String(params.offset))
      const qs = q.toString()
      return request<Monitor[]>(`/api/monitors${qs ? `?${qs}` : ''}`)
    },

    get: (id: string) => request<Monitor>(`/api/monitors/${id}`),

    update: (id: string, data: UpdateMonitorRequest) =>
      request<Monitor>(`/api/monitors/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/api/monitors/${id}`, { method: 'DELETE' }),

    results: (id: string) =>
      request<unknown[]>(`/api/monitors/${id}/results`),
  },

  alerts: {
    list: (params?: { status?: string; severity?: string; limit?: number }) => {
      const q = new URLSearchParams()
      if (params?.status) q.set('status', params.status)
      if (params?.severity) q.set('severity', params.severity)
      if (params?.limit !== undefined) q.set('limit', String(params.limit))
      const qs = q.toString()
      return request<Alert[]>(`/api/alerts${qs ? `?${qs}` : ''}`)
    },

    update: (id: string, data: UpdateAlertRequest) =>
      request<Alert>(`/api/alerts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  dashboard: {
    stats: () => request<DashboardStats>('/api/dashboard/stats'),
  },

  geolocate: (ips: string[]) =>
    request<Record<string, { ip: string; country: string; city: string; lat: number; lon: number; isp: string }>>(
      '/api/geolocate',
      { method: 'POST', body: JSON.stringify({ ips }) },
    ),

  wordlists: {
    list: () => request<Wordlist[]>('/api/wordlists'),

    upload: async (name: string, type: string, file: File) => {
      const form = new FormData()
      form.append('name', name)
      form.append('type', type)
      form.append('file', file)
      const res = await fetch('/api/wordlists', { method: 'POST', body: form })
      if (!res.ok) throw new ApiError(res.status, await res.text())
      return res.json() as Promise<Wordlist>
    },

    delete: (id: string) => request<void>(`/api/wordlists/${id}`, { method: 'DELETE' }),
  },
}
