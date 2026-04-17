import { type FormEvent, useState } from 'react'
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ToolPage } from '../components/ToolPage'
import { useScanPoll } from '../hooks/useScanPoll'

interface MacLookupResult {
  mac?: string
  oui_prefix?: string
  vendor?: string
  address?: string
  registry?: string
  address_type?: string
  scope?: string
  latitude?: number
  longitude?: number
  cache_age?: string
  [key: string]: unknown
}

interface VendorMapProps {
  lat: number
  lon: number
  vendor: string
  address: string
}

function VendorMap({ lat, lon, vendor, address }: VendorMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current) return

    // Remove any existing map
    if (leafletMap.current) {
      leafletMap.current.remove()
      leafletMap.current = null
    }

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([lat, lon], 5)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 16,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const color = '#0ea5e9'
    const size = 24

    const icon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:${size}px;height:${size}px">
          <div style="
            position:absolute;inset:0;border-radius:50%;
            background:radial-gradient(circle,${color}40 0%,${color}10 50%,transparent 70%);
            animation:pulse-glow 2s ease-in-out infinite;
          "></div>
          <div style="
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            width:8px;height:8px;
            background:${color};border-radius:50%;
            border:1px solid rgba(255,255,255,0.6);
            box-shadow:0 0 10px ${color},0 0 20px ${color}60;
          "></div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })

    const marker = L.marker([lat, lon], { icon }).addTo(map)

    marker.bindPopup(`
      <div style="
        font-family:'IBM Plex Mono',monospace;font-size:11px;min-width:180px;
        color:#e8edf5;background:linear-gradient(135deg,#0b0f18,#0f1420);
        padding:14px;border-radius:10px;border:1px solid ${color}30;
        box-shadow:0 0 30px ${color}15,0 4px 20px rgba(0,0,0,0.5);
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div>
          <span style="font-size:12px;font-weight:600;color:${color}">${vendor}</span>
        </div>
        <div style="color:#7a8ba8;font-size:10px;margin-top:4px">${address}</div>
      </div>
    `, { className: 'netscope-popup', closeButton: false, offset: [0, -5] })

    leafletMap.current = map

    return () => {
      map.remove()
      leafletMap.current = null
    }
  }, [lat, lon, vendor, address])

  return (
    <div className="rounded-xl overflow-hidden mt-4" style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
    }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
          Vendor Location
        </span>
      </div>
      <div ref={mapRef} style={{ height: 300, background: '#06080d' }} />
      <style>{`
        .netscope-popup .leaflet-popup-content-wrapper { background:transparent !important; box-shadow:none !important; padding:0 !important; border-radius:10px !important; }
        .netscope-popup .leaflet-popup-content { margin:0 !important; }
        .netscope-popup .leaflet-popup-tip { background:#0b0f18 !important; }
        @keyframes pulse-glow { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.3); } }
        .leaflet-control-zoom a { background:#0f1420 !important; color:#7a8ba8 !important; border-color:rgba(99,179,237,0.1) !important; }
        .leaflet-control-zoom a:hover { background:#182030 !important; color:#0ea5e9 !important; }
      `}</style>
    </div>
  )
}

export function MacLookup() {
  const [target, setTarget] = useState('')
  const { scan, polling, submitting, error, submit } = useScanPoll()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target.trim()) return
    await submit('maclookup', target.trim())
  }

  const result = (scan?.result ?? null) as MacLookupResult | null

  const Field = ({ label, value }: { label: string; value: string | undefined }) =>
    value ? (
      <div className="flex gap-4 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-xs w-28 shrink-0 pt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
          {label}
        </span>
        <span className="text-sm break-all" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono)' }}>
          {value}
        </span>
      </div>
    ) : null

  return (
    <ToolPage
      title="MAC Lookup"
      description="Look up vendor and manufacturer information from a MAC address OUI prefix"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        scan?.result && scan.status === 'completed' ? (
          <>
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
                  OUI Lookup Result
                </span>
              </div>
              <div className="px-4 py-2">
                <Field label="MAC Address" value={result?.mac} />
                <Field label="OUI Prefix" value={result?.oui_prefix} />
                <Field label="Vendor" value={result?.vendor} />
                <Field label="Address" value={result?.address} />
                <Field label="Registry" value={result?.registry} />
                <Field label="Address Type" value={result?.address_type} />
                <Field label="Scope" value={result?.scope} />
                <Field label="Cache" value={result?.cache_age} />
              </div>
            </div>
            {result?.latitude != null && result?.longitude != null && (
              <VendorMap
                lat={result.latitude}
                lon={result.longitude}
                vendor={result.vendor ?? ''}
                address={result.address ?? ''}
              />
            )}
          </>
        ) : scan?.status === 'failed' ? (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)', fontFamily: 'var(--font-family-mono)' }}>
            {scan.error ?? 'Scan failed'}
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label
            className="block text-xs font-medium mb-1.5 uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
          >
            MAC Address
          </label>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. 00:1A:2B:3C:4D:5E"
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-family-mono)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
          />
          <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
            Supported formats: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABB.CCDD.EEFF, AABBCCDDEEFF
          </p>
        </div>
        <div>
          <button
            type="submit"
            disabled={submitting || polling}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{
              background: 'linear-gradient(to right, var(--color-accent), #0284c7)',
              opacity: submitting || polling ? 0.6 : 1,
              fontFamily: 'var(--font-family-heading)',
            }}
          >
            {submitting ? 'Starting...' : polling ? 'Looking up...' : 'MAC Lookup'}
          </button>
        </div>
      </form>
    </ToolPage>
  )
}
