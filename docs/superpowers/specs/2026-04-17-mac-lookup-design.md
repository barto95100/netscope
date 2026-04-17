# MAC Lookup Feature — Design Spec

**Date:** 2026-04-17
**Status:** Approved

## Overview

Add a MAC address lookup tool to NetScope that identifies the hardware vendor/manufacturer from a MAC address using the official IEEE OUI database. Includes map visualization of the vendor's location.

## Requirements

- Support 4 MAC input formats: `AA:BB:CC:DD:EE:FF`, `AA-BB-CC-DD-EE-FF`, `AABB.CCDD.EEFF`, `AABBCCDDEEFF`
- Look up vendor across all 3 IEEE registries (MA-L 24-bit, MA-M 28-bit, MA-S 36-bit)
- Display: normalized MAC, OUI prefix, vendor name, vendor address, registry type, unicast/multicast, global/local scope
- Show vendor location on a map (Leaflet) when geocoding succeeds
- Lazy-download IEEE CSV files on first lookup, cache with 24h TTL

## Architecture

### Approach: Synchronous lookup in tool (pipeline scan)

Reuses the existing scan pipeline (`POST /api/scans` -> dispatcher -> worker -> result). No new endpoint, no new DB table, no WebSocket needed.

### Data Source

Official IEEE CSV files downloaded on-demand to `/data/oui/`:

| File | URL | Size | Content |
|------|-----|------|---------|
| oui.csv | `https://standards-oui.ieee.org/oui/oui.csv` | ~3.6 Mo | MA-L (24-bit OUI) |
| mam.csv | `https://standards-oui.ieee.org/oui28/mam.csv` | ~700 Ko | MA-M (28-bit) |
| oui36.csv | `https://standards-oui.ieee.org/oui36/oui36.csv` | ~630 Ko | MA-S (36-bit) |

CSV format: `Registry,Assignment,Organization Name,Organization Address`

### Cache Strategy — Lazy Update with 24h TTL

```
if files exist AND mtime < 24h:
    lookup directly in local files
else:
    download all 3 CSVs from IEEE
    replace old files
    lookup in new files
```

- Check `mtime` of files on disk to determine freshness
- No cron, no background scheduler — download only triggered by user lookup
- If download fails and old files exist, fall back to stale files
- Storage: `/data/oui/` volume mounted in worker container

## Backend

### Result struct

```go
type MacLookupResult struct {
    MAC         string   `json:"mac"`           // Normalized "AA:BB:CC:DD:EE:FF"
    OUIPrefix   string   `json:"oui_prefix"`    // "AA:BB:CC" (or 28/36-bit)
    Vendor      string   `json:"vendor"`        // "Cisco Systems, Inc."
    Address     string   `json:"address"`       // Vendor address from IEEE
    Registry    string   `json:"registry"`      // "MA-L", "MA-M", "MA-S"
    AddressType string   `json:"address_type"`  // "unicast" or "multicast"
    Scope       string   `json:"scope"`         // "global" (UAA) or "local" (LAA)
    Latitude    *float64 `json:"latitude,omitempty"`
    Longitude   *float64 `json:"longitude,omitempty"`
    CacheAge    string   `json:"cache_age"`     // Freshness info
}
```

### Lookup logic

1. Validate and normalize MAC input (support `:`, `-`, `.`, no separator)
2. Check cache: if 3 CSV files exist in `/data/oui/` and are < 24h old, use directly
3. Otherwise, download 3 CSVs from IEEE, replace old files
4. Parse CSVs in memory, search by prefix: MA-L (24-bit) first, then MA-M (28-bit), then MA-S (36-bit)
5. Compute unicast/multicast from bit 0 of first octet, global/local from bit 1
6. Geocode vendor address via Nominatim (`https://nominatim.openstreetmap.org/search`)
7. Return result

### Geocoding

- Service: Nominatim (OpenStreetMap) — free, no API key
- Rate limit: 1 req/sec, User-Agent header `"NetScope/1.0"`
- If geocoding fails (vague address, timeout), omit lat/lng fields — not blocking
- No separate geocoding cache

### Integration points

- `internal/tools/validate.go`: Add `"maclookup"` to `validScanTypes`, add MAC format validation for this scan type
- `internal/worker/dispatcher.go`: Add `case "maclookup"` in `execute()`
- `docker-compose.yml`: Add `/data/oui` volume to worker service

## Frontend

### Page: `frontend/src/pages/MacLookup.tsx`

- Input: text field, placeholder `"00:1A:2B:3C:4D:5E"`, accepts all formats
- Uses `ToolPage` component + `useScanPoll` hook (same as Whois, DNS, etc.)
- Result display: table/card with all fields from `MacLookupResult`
- Map: Leaflet map below result table, centered on vendor with marker + popup (vendor name)
  - Only displayed when `latitude` and `longitude` are present
  - Reuses same Leaflet library as PathMap component

### Navigation

- `Sidebar.tsx`: Add entry in "Network" group
- `App.tsx`: Add route `/mac-lookup`

## Files to create/modify

| Action | File | Description |
|--------|------|-------------|
| Create | `internal/tools/maclookup.go` | Lookup logic, cache management, geocoding |
| Modify | `internal/tools/validate.go` | Add `"maclookup"` scan type + MAC validation |
| Modify | `internal/worker/dispatcher.go` | Add `case "maclookup"` |
| Modify | `docker-compose.yml` | Add `/data/oui` volume to worker |
| Create | `frontend/src/pages/MacLookup.tsx` | UI page |
| Modify | `frontend/src/components/Sidebar.tsx` | Navigation entry |
| Modify | `frontend/src/App.tsx` | Route |

## Not needed

- No new API endpoint (reuses `POST /api/scans`)
- No new DB table or migration (result stored in scan's `result` JSONB)
- No WebSocket (lookup is fast, standard polling suffices)
- No cron/scheduler (lazy download on user action)
- No new Docker image (runs in existing worker)
