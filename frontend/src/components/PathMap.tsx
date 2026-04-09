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
  const layersRef = useRef<L.LayerGroup | null>(null)
  const [points, setPoints] = useState<GeoPoint[]>([])
  const [loading, setLoading] = useState(false)

  // Geolocate IPs
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
            ip: hop.address, lat: g.lat, lon: g.lon,
            city: g.city, country: g.country, isp: g.isp,
            ttl: hop.ttl, host: hop.host, rtt_ms: hop.rtt_ms,
          })
        }
      }
      setPoints(pts)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [hops])

  // Render map
  useEffect(() => {
    if (!mapRef.current) return

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      }).setView([30, 0], 2)

      // Ultra dark custom tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 16,
      }).addTo(leafletMap.current)

      // Zoom control bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(leafletMap.current)

      layersRef.current = L.layerGroup().addTo(leafletMap.current)
    }

    const layers = layersRef.current!
    const map = leafletMap.current!
    layers.clearLayers()

    if (points.length === 0) return

    const latLngs: L.LatLngExpression[] = []

    points.forEach((pt, i) => {
      const isFirst = i === 0
      const isLast = i === points.length - 1
      const latLng: L.LatLngExpression = [pt.lat, pt.lon]
      latLngs.push(latLng)

      // Outer glow ring
      const glowSize = isFirst || isLast ? 32 : 20
      const color = isFirst ? '#10b981' : isLast ? '#ef4444' : '#0ea5e9'

      const glowIcon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;width:${glowSize}px;height:${glowSize}px">
            <div style="
              position:absolute;inset:0;
              border-radius:50%;
              background:radial-gradient(circle,${color}40 0%,${color}10 50%,transparent 70%);
              animation:pulse-glow 2s ease-in-out infinite;
            "></div>
            <div style="
              position:absolute;
              top:50%;left:50%;
              transform:translate(-50%,-50%);
              width:${isFirst || isLast ? 10 : 6}px;
              height:${isFirst || isLast ? 10 : 6}px;
              background:${color};
              border-radius:50%;
              border:${isFirst || isLast ? 2 : 1}px solid rgba(255,255,255,0.6);
              box-shadow:0 0 10px ${color},0 0 20px ${color}60;
            "></div>
            ${isFirst ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:9px;color:#10b981;white-space:nowrap;text-shadow:0 0 6px #10b98180;letter-spacing:1px">SOURCE</div>` : ''}
            ${isLast ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:9px;color:#ef4444;white-space:nowrap;text-shadow:0 0 6px #ef444480;letter-spacing:1px">TARGET</div>` : ''}
          </div>
        `,
        iconSize: [glowSize, glowSize],
        iconAnchor: [glowSize / 2, glowSize / 2],
      })

      const marker = L.marker(latLng, { icon: glowIcon }).addTo(layers)

      // Popup styled
      marker.bindPopup(`
        <div style="
          font-family:'IBM Plex Mono',monospace;
          font-size:11px;
          min-width:200px;
          color:#e8edf5;
          background:linear-gradient(135deg,#0b0f18 0%,#0f1420 100%);
          padding:14px;
          border-radius:10px;
          border:1px solid ${color}30;
          box-shadow:0 0 30px ${color}15,0 4px 20px rgba(0,0,0,0.5);
        ">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div>
            <span style="font-size:12px;font-weight:600;color:${color}">
              ${isFirst ? 'Source' : isLast ? 'Destination' : `Hop ${pt.ttl + 1}`}
            </span>
          </div>
          <div style="color:#0ea5e9;font-size:12px;margin-bottom:2px">${pt.ip}</div>
          ${pt.host && pt.host !== pt.ip ? `<div style="color:#7a8ba8;font-size:11px">${pt.host}</div>` : ''}
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(14,165,233,0.1)">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="color:#4a5568">Location</span>
              <span style="color:#e8edf5">${pt.city}${pt.city && pt.country ? ', ' : ''}${pt.country}</span>
            </div>
            ${pt.isp ? `
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="color:#4a5568">ISP</span>
              <span style="color:#7a8ba8">${pt.isp}</span>
            </div>` : ''}
            ${pt.rtt_ms ? `
            <div style="display:flex;justify-content:space-between">
              <span style="color:#4a5568">Latency</span>
              <span style="color:#0ea5e9;font-weight:600">${pt.rtt_ms.toFixed(2)} ms</span>
            </div>` : ''}
          </div>
        </div>
      `, { className: 'netscope-popup', closeButton: false, offset: [0, -5] })
    })

    // Neon path lines
    if (latLngs.length > 1) {
      // Outer glow
      L.polyline(latLngs, {
        color: '#0ea5e9',
        weight: 6,
        opacity: 0.08,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers)

      // Mid glow
      L.polyline(latLngs, {
        color: '#0ea5e9',
        weight: 3,
        opacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers)

      // Core line
      L.polyline(latLngs, {
        color: '#0ea5e9',
        weight: 1.5,
        opacity: 0.8,
        dashArray: '6, 8',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers)
    }

    // Fit bounds
    if (latLngs.length > 0) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 8 })
    }

  }, [points, target])

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
    <div className="rounded-xl overflow-hidden" style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      boxShadow: '0 0 40px rgba(14,165,233,0.03)',
    }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
            Path Map
          </span>
          {points.length > 0 && (
            <div className="flex items-center gap-4 text-[10px]" style={{ fontFamily: 'var(--font-family-mono)' }}>
              <span className="flex items-center gap-1.5">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 4px #10b981' }} />
                <span style={{ color: 'var(--color-text-tertiary)' }}>Source</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9', display: 'inline-block', boxShadow: '0 0 4px #0ea5e9' }} />
                <span style={{ color: 'var(--color-text-tertiary)' }}>Hop</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 4px #ef4444' }} />
                <span style={{ color: 'var(--color-text-tertiary)' }}>Target</span>
              </span>
            </div>
          )}
        </div>
        {loading && (
          <span className="text-xs flex items-center gap-2" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
            Geolocating...
          </span>
        )}
        {!loading && points.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
            {points.length} hops &middot; {points[0]?.country} → {points[points.length - 1]?.country}
          </span>
        )}
      </div>
      <div ref={mapRef} style={{ height: 420, background: '#06080d' }} />
      <style>{`
        .netscope-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 10px !important;
        }
        .netscope-popup .leaflet-popup-content { margin: 0 !important; }
        .netscope-popup .leaflet-popup-tip { background: #0b0f18 !important; }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        .leaflet-control-zoom a {
          background: #0f1420 !important;
          color: #7a8ba8 !important;
          border-color: rgba(99,179,237,0.1) !important;
        }
        .leaflet-control-zoom a:hover {
          background: #182030 !important;
          color: #0ea5e9 !important;
        }
      `}</style>
    </div>
  )
}
