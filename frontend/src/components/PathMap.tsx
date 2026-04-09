import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../api/client'

interface Hop {
  ttl: number
  host?: string
  address?: string
  rtt_ms?: number
  timeout?: boolean
}

interface GeoPoint {
  ip: string
  lat: number
  lon: number
  city: string
  country: string
  isp: string
  ttl: number
  host?: string
  rtt_ms?: number
}

interface PathMapProps {
  hops: Hop[]
  target: string
}

export function PathMap({ hops, target }: PathMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const [points, setPoints] = useState<GeoPoint[]>([])
  const [loading, setLoading] = useState(false)

  // Geolocate IPs when hops change
  useEffect(() => {
    const ips = hops
      .filter(h => !h.timeout && h.address && h.address !== '???' && h.address !== '*')
      .map(h => h.address!)

    if (ips.length === 0) return

    setLoading(true)
    api.geolocate(ips).then(geo => {
      const pts: GeoPoint[] = []
      for (const hop of hops) {
        if (hop.timeout || !hop.address) continue
        const g = geo[hop.address]
        if (g && g.lat !== 0 && g.lon !== 0) {
          pts.push({
            ip: hop.address,
            lat: g.lat,
            lon: g.lon,
            city: g.city,
            country: g.country,
            isp: g.isp,
            ttl: hop.ttl,
            host: hop.host,
            rtt_ms: hop.rtt_ms,
          })
        }
      }
      setPoints(pts)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [hops])

  // Render map
  useEffect(() => {
    if (!mapRef.current || points.length === 0) return

    // Create map if not exists
    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([48, 2], 4)

      // Dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(leafletMap.current)
    }

    const map = leafletMap.current

    // Clear previous layers (except tile layer)
    map.eachLayer(layer => {
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer)
      }
    })

    // Add markers and path
    const latLngs: L.LatLngExpression[] = []

    points.forEach((pt, i) => {
      const isFirst = i === 0
      const isLast = i === points.length - 1
      const latLng: L.LatLngExpression = [pt.lat, pt.lon]
      latLngs.push(latLng)

      // Marker
      const size = isFirst || isLast ? 12 : 8
      const color = isFirst ? '#10b981' : isLast ? '#ef4444' : '#0ea5e9'
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${size}px; height:${size}px;
          background:${color};
          border-radius:50%;
          border:2px solid ${isFirst || isLast ? 'white' : 'rgba(255,255,255,0.3)'};
          box-shadow:0 0 ${isFirst || isLast ? 12 : 6}px ${color};
        "></div>`,
        iconSize: [size + 4, size + 4],
        iconAnchor: [(size + 4) / 2, (size + 4) / 2],
      })

      const marker = L.marker(latLng, { icon }).addTo(map)

      // Popup
      const label = isFirst ? 'Source' : isLast ? `Destination (${target})` : `Hop ${pt.ttl}`
      marker.bindPopup(`
        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:180px;color:#e8edf5;background:#0f1420;padding:10px;border-radius:8px;border:1px solid rgba(99,179,237,0.1)">
          <div style="font-weight:600;color:${color};margin-bottom:6px;font-size:13px">${label}</div>
          <div style="color:#7a8ba8;margin-bottom:3px">${pt.ip}</div>
          ${pt.host ? `<div style="color:#7a8ba8;margin-bottom:3px">${pt.host}</div>` : ''}
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(99,179,237,0.1)">
            <div style="color:#94a3b8">${pt.city}${pt.city && pt.country ? ', ' : ''}${pt.country}</div>
            ${pt.isp ? `<div style="color:#4a5568;margin-top:2px;font-size:11px">${pt.isp}</div>` : ''}
            ${pt.rtt_ms ? `<div style="color:#0ea5e9;margin-top:4px">${pt.rtt_ms.toFixed(2)} ms</div>` : ''}
          </div>
        </div>
      `, {
        className: 'netscope-popup',
        closeButton: false,
      })
    })

    // Draw path line
    if (latLngs.length > 1) {
      // Animated dashed line
      L.polyline(latLngs, {
        color: '#0ea5e9',
        weight: 2,
        opacity: 0.6,
        dashArray: '8, 12',
      }).addTo(map)

      // Solid glow line underneath
      L.polyline(latLngs, {
        color: '#0ea5e9',
        weight: 1,
        opacity: 0.2,
      }).addTo(map)
    }

    // Fit bounds
    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs)
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
    }

  }, [points, target])

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [])

  if (hops.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
          Path Map
        </span>
        {loading && (
          <span className="text-xs flex items-center gap-2" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
            Geolocating...
          </span>
        )}
        {!loading && points.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
            {points.length} hops located
          </span>
        )}
      </div>
      <div ref={mapRef} style={{ height: 400 }} />
      <style>{`
        .netscope-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 8px !important;
        }
        .netscope-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .netscope-popup .leaflet-popup-tip {
          background: #0f1420 !important;
          border: 1px solid rgba(99,179,237,0.1) !important;
        }
      `}</style>
    </div>
  )
}
