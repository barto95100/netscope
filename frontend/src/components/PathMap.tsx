import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../api/client'
import { usePrivacy } from '../hooks/usePrivacy'

interface Hop {
  ttl: number
  host?: string
  address?: string
  rtt_ms?: number
  timeout?: boolean
  loss_percent?: number
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
  loss_percent?: number
}

interface PathMapProps {
  hops: Hop[]
  target: string
  live?: boolean
}

export function PathMap({ hops, target, live: _live }: PathMapProps) {
  const { maskIp } = usePrivacy()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const layersRef = useRef<L.LayerGroup | null>(null)
  const packetLayerRef = useRef<L.LayerGroup | null>(null)
  const animFrameRef = useRef<number>(0)
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
            loss_percent: hop.loss_percent,
          })
        }
      }
      setPoints(pts)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [hops])

  function rttColor(ms?: number) {
    if (!ms || ms < 30) return '#10b981'
    if (ms < 100) return '#eab308'
    return '#ef4444'
  }

  function segmentOpacity(loss?: number) {
    if (!loss || loss === 0) return 0.8
    if (loss < 10) return 0.6
    return 0.3
  }

  // Packet animation
  const animatePackets = useCallback((_map: L.Map, packetLayer: L.LayerGroup, pts: GeoPoint[]) => {
    if (pts.length < 2) return

    const segments: { from: L.LatLng; to: L.LatLng; color: string; loss: number }[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      segments.push({
        from: L.latLng(pts[i].lat, pts[i].lon),
        to: L.latLng(pts[i + 1].lat, pts[i + 1].lon),
        color: rttColor(pts[i + 1].rtt_ms),
        loss: pts[i + 1].loss_percent || 0,
      })
    }

    const packets: { marker: L.Marker; segIdx: number; progress: number; speed: number }[] = []

    // Create initial packets
    function spawnPacket(segIdx: number) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:6px;height:6px;border-radius:50%;
          background:#0ea5e9;
          box-shadow:0 0 8px #0ea5e9,0 0 16px #0ea5e980;
        "></div>`,
        iconSize: [6, 6],
        iconAnchor: [3, 3],
      })
      const marker = L.marker(segments[segIdx].from, { icon, interactive: false }).addTo(packetLayer)
      packets.push({ marker, segIdx, progress: 0, speed: 0.008 + Math.random() * 0.004 })
    }

    // Spawn packets staggered
    let spawnTimer = 0

    function animate() {
      spawnTimer++
      // Spawn a new packet every ~60 frames from the start
      if (spawnTimer % 60 === 0 && segments.length > 0) {
        spawnPacket(0)
      }

      for (let i = packets.length - 1; i >= 0; i--) {
        const pkt = packets[i]
        pkt.progress += pkt.speed

        if (pkt.progress >= 1) {
          // Move to next segment
          pkt.segIdx++
          pkt.progress = 0

          if (pkt.segIdx >= segments.length) {
            // Reached destination - remove
            packetLayer.removeLayer(pkt.marker)
            packets.splice(i, 1)
            continue
          }

          // Simulate packet loss - packet disappears
          const seg = segments[pkt.segIdx]
          if (seg.loss > 0 && Math.random() * 100 < seg.loss) {
            // Flash the packet red before removing
            const lostIcon = L.divIcon({
              className: '',
              html: `<div style="
                width:8px;height:8px;border-radius:50%;
                background:#ef4444;
                box-shadow:0 0 12px #ef4444,0 0 24px #ef444480;
                animation:packet-lost 0.3s ease-out forwards;
              "></div>`,
              iconSize: [8, 8],
              iconAnchor: [4, 4],
            })
            pkt.marker.setIcon(lostIcon)
            setTimeout(() => {
              packetLayer.removeLayer(pkt.marker)
            }, 300)
            packets.splice(i, 1)
            continue
          }
        }

        const seg = segments[pkt.segIdx]
        const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * pkt.progress
        const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * pkt.progress
        pkt.marker.setLatLng([lat, lng])

        // Color packet based on segment quality
        const segColor = seg.loss > 20 ? '#ef4444' : rttColor(undefined)
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:6px;height:6px;border-radius:50%;
            background:${segColor};
            box-shadow:0 0 8px ${segColor},0 0 16px ${segColor}80;
          "></div>`,
          iconSize: [6, 6],
          iconAnchor: [3, 3],
        })
        pkt.marker.setIcon(icon)
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    // Start with a few packets
    spawnPacket(0)
    animate()
  }, [])

  // Render map
  useEffect(() => {
    if (!mapRef.current) return

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      }).setView([30, 0], 2)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 16,
      }).addTo(leafletMap.current)

      L.control.zoom({ position: 'bottomright' }).addTo(leafletMap.current)
      layersRef.current = L.layerGroup().addTo(leafletMap.current)
      packetLayerRef.current = L.layerGroup().addTo(leafletMap.current)
    }

    const map = leafletMap.current!
    const layers = layersRef.current!
    const packetLayer = packetLayerRef.current!

    // Stop previous animation
    cancelAnimationFrame(animFrameRef.current)
    layers.clearLayers()
    packetLayer.clearLayers()

    if (points.length === 0) return

    const latLngs: L.LatLngExpression[] = []

    // Draw segments with per-hop coloring
    for (let i = 0; i < points.length - 1; i++) {
      const from: L.LatLngExpression = [points[i].lat, points[i].lon]
      const to: L.LatLngExpression = [points[i + 1].lat, points[i + 1].lon]
      const color = rttColor(points[i + 1].rtt_ms)
      const opacity = segmentOpacity(points[i + 1].loss_percent)
      const hasLoss = (points[i + 1].loss_percent || 0) > 0

      // Outer glow
      L.polyline([from, to], {
        color,
        weight: hasLoss ? 8 : 6,
        opacity: hasLoss ? 0.15 : 0.06,
        lineCap: 'round',
      }).addTo(layers)

      // Core
      L.polyline([from, to], {
        color,
        weight: hasLoss ? 2 : 1.5,
        opacity,
        dashArray: hasLoss ? '4, 6' : '6, 8',
        lineCap: 'round',
      }).addTo(layers)
    }

    // Markers
    points.forEach((pt, i) => {
      const isFirst = i === 0
      const isLast = i === points.length - 1
      const latLng: L.LatLngExpression = [pt.lat, pt.lon]
      latLngs.push(latLng)

      const color = isFirst ? '#10b981' : isLast ? '#ef4444' : rttColor(pt.rtt_ms)
      const hasLoss = (pt.loss_percent || 0) > 0
      const size = isFirst || isLast ? 32 : hasLoss ? 28 : 20

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;width:${size}px;height:${size}px">
            <div style="
              position:absolute;inset:0;border-radius:50%;
              background:radial-gradient(circle,${color}40 0%,${color}10 50%,transparent 70%);
              animation:pulse-glow 2s ease-in-out infinite;
            "></div>
            ${hasLoss && !isFirst && !isLast ? `<div style="
              position:absolute;inset:-4px;border-radius:50%;
              border:1px solid ${color}40;
              animation:pulse-glow 1.5s ease-in-out infinite;
            "></div>` : ''}
            <div style="
              position:absolute;top:50%;left:50%;
              transform:translate(-50%,-50%);
              width:${isFirst || isLast ? 10 : hasLoss ? 8 : 6}px;
              height:${isFirst || isLast ? 10 : hasLoss ? 8 : 6}px;
              background:${color};border-radius:50%;
              border:${isFirst || isLast ? 2 : 1}px solid rgba(255,255,255,0.6);
              box-shadow:0 0 10px ${color},0 0 20px ${color}60;
            "></div>
            ${isFirst ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:9px;color:#10b981;white-space:nowrap;text-shadow:0 0 6px #10b98180;letter-spacing:1px">SOURCE</div>` : ''}
            ${isLast ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:9px;color:#ef4444;white-space:nowrap;text-shadow:0 0 6px #ef444480;letter-spacing:1px">TARGET</div>` : ''}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })

      const marker = L.marker(latLng, { icon }).addTo(layers)

      const label = isFirst ? 'Source' : isLast ? `Destination (${maskIp(target)})` : `Hop ${pt.ttl + 1}`
      const maskedIp = maskIp(pt.ip)
      const lossInfo = pt.loss_percent && pt.loss_percent > 0
        ? `<div style="display:flex;justify-content:space-between;margin-top:3px"><span style="color:#ef4444">Packet Loss</span><span style="color:#ef4444;font-weight:600">${pt.loss_percent.toFixed(1)}%</span></div>`
        : ''

      marker.bindPopup(`
        <div style="
          font-family:'IBM Plex Mono',monospace;font-size:11px;min-width:200px;
          color:#e8edf5;background:linear-gradient(135deg,#0b0f18,#0f1420);
          padding:14px;border-radius:10px;border:1px solid ${color}30;
          box-shadow:0 0 30px ${color}15,0 4px 20px rgba(0,0,0,0.5);
        ">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div>
            <span style="font-size:12px;font-weight:600;color:${color}">${label}</span>
          </div>
          <div style="color:#0ea5e9;font-size:12px;margin-bottom:2px">${maskedIp}</div>
          ${pt.host && pt.host !== pt.ip ? `<div style="color:#7a8ba8">${maskIp(pt.host)}</div>` : ''}
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(14,165,233,0.1)">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:#4a5568">Location</span><span style="color:#e8edf5">${pt.city}${pt.city && pt.country ? ', ' : ''}${pt.country}</span></div>
            ${pt.isp ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:#4a5568">ISP</span><span style="color:#7a8ba8">${pt.isp}</span></div>` : ''}
            ${pt.rtt_ms ? `<div style="display:flex;justify-content:space-between"><span style="color:#4a5568">Latency</span><span style="color:${rttColor(pt.rtt_ms)};font-weight:600">${pt.rtt_ms.toFixed(2)} ms</span></div>` : ''}
            ${lossInfo}
          </div>
        </div>
      `, { className: 'netscope-popup', closeButton: false, offset: [0, -5] })
    })

    // Fit bounds
    if (latLngs.length > 0) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 8 })
    }

    // Animate packets
    animatePackets(map, packetLayer, points)

  }, [points, target, animatePackets])

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [])

  if (hops.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden h-full" style={{
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
        {loading ? (
          <span className="text-xs flex items-center gap-2" style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-family-mono)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
            Geolocating...
          </span>
        ) : points.length > 0 ? (
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
            {points.length}/{hops.filter(h => !h.timeout).length} hops located &middot; {points[0]?.country} &rarr; {points[points.length - 1]?.country}
          </span>
        ) : null}
      </div>
      <div ref={mapRef} style={{ height: 'calc(100% - 44px)', minHeight: 380, background: '#06080d' }} />
      <style>{`
        .netscope-popup .leaflet-popup-content-wrapper { background:transparent !important; box-shadow:none !important; padding:0 !important; border-radius:10px !important; }
        .netscope-popup .leaflet-popup-content { margin:0 !important; }
        .netscope-popup .leaflet-popup-tip { background:#0b0f18 !important; }
        @keyframes pulse-glow { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.3); } }
        @keyframes packet-lost { 0% { transform:scale(1); opacity:1; } 100% { transform:scale(3); opacity:0; } }
        .leaflet-control-zoom a { background:#0f1420 !important; color:#7a8ba8 !important; border-color:rgba(99,179,237,0.1) !important; }
        .leaflet-control-zoom a:hover { background:#182030 !important; color:#0ea5e9 !important; }
      `}</style>
    </div>
  )
}
