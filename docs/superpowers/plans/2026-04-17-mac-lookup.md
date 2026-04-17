# MAC Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a MAC address vendor lookup tool that identifies hardware manufacturers from MAC addresses using the official IEEE OUI database, with vendor location displayed on a map.

**Architecture:** Synchronous lookup in `internal/tools/maclookup.go` that lazily downloads IEEE CSV files to `/data/oui/` with a 24h TTL cache. Reuses the existing scan pipeline (POST /api/scans -> dispatcher -> worker -> result). Vendor address geocoded via Nominatim for map display.

**Tech Stack:** Go (backend tool + CSV parsing + HTTP download + Nominatim geocoding), React + TypeScript + Leaflet (frontend page + map), existing scan pipeline infrastructure.

---

### Task 1: Add `OUI_DIR` config and Docker volume

**Files:**
- Modify: `internal/config/config.go:7-13`
- Modify: `docker-compose.yml:49-55`

- [ ] **Step 1: Add OUI_DIR to config struct**

In `internal/config/config.go`, add the `OUIDir` field to the `Config` struct:

```go
type Config struct {
	APIPort     int    `env:"API_PORT" envDefault:"8080"`
	DatabaseURL string `env:"DATABASE_URL" envDefault:"postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable"`
	NatsURL     string `env:"NATS_URL" envDefault:"nats://localhost:4222"`
	StaticDir   string `env:"STATIC_DIR" envDefault:""`
	ReposDir    string `env:"REPOS_DIR" envDefault:"data/repos"`
	OUIDir      string `env:"OUI_DIR" envDefault:"data/oui"`
}
```

- [ ] **Step 2: Add volume and env var to docker-compose.yml**

In `docker-compose.yml`, add to the `worker` service:

```yaml
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_started
    cap_add:
      - NET_RAW
    environment:
      DATABASE_URL: postgres://netscope:netscope@postgres:5432/netscope?sslmode=disable
      NATS_URL: nats://nats:4222
      REPOS_DIR: /data/repos
      OUI_DIR: /data/oui
    volumes:
      - reposdata:/data/repos
      - ouidata:/data/oui

volumes:
  pgdata:
  reposdata:
  ouidata:
```

- [ ] **Step 3: Commit**

```bash
git add internal/config/config.go docker-compose.yml
git commit -m "feat(maclookup): add OUI_DIR config and Docker volume"
```

---

### Task 2: Create `internal/tools/maclookup.go` — MAC validation, normalization, and bit analysis

**Files:**
- Create: `internal/tools/maclookup.go`

- [ ] **Step 1: Create the file with MAC parsing utilities and result struct**

Create `internal/tools/maclookup.go`:

```go
package tools

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const ouiCacheTTL = 24 * time.Hour

var macPatterns = []*regexp.Regexp{
	regexp.MustCompile(`^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$`),       // AA:BB:CC:DD:EE:FF
	regexp.MustCompile(`^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$`),       // AA-BB-CC-DD-EE-FF
	regexp.MustCompile(`^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$`),      // AABB.CCDD.EEFF
	regexp.MustCompile(`^[0-9A-Fa-f]{12}$`),                           // AABBCCDDEEFF
}

// MacLookupResult holds the result of a MAC address vendor lookup.
type MacLookupResult struct {
	MAC         string   `json:"mac"`
	OUIPrefix   string   `json:"oui_prefix"`
	Vendor      string   `json:"vendor"`
	Address     string   `json:"address"`
	Registry    string   `json:"registry"`
	AddressType string   `json:"address_type"`
	Scope       string   `json:"scope"`
	Latitude    *float64 `json:"latitude,omitempty"`
	Longitude   *float64 `json:"longitude,omitempty"`
	CacheAge    string   `json:"cache_age"`
}

// ouiEntry represents a single row from an IEEE OUI CSV file.
type ouiEntry struct {
	Registry string
	Prefix   string
	Vendor   string
	Address  string
}

// ouiFile describes one of the three IEEE CSV files to download.
type ouiFile struct {
	Name string
	URL  string
}

var ouiFiles = []ouiFile{
	{Name: "oui.csv", URL: "https://standards-oui.ieee.org/oui/oui.csv"},
	{Name: "mam.csv", URL: "https://standards-oui.ieee.org/oui28/mam.csv"},
	{Name: "oui36.csv", URL: "https://standards-oui.ieee.org/oui36/oui36.csv"},
}

// normalizeMac strips all separators and returns uppercase hex digits.
// Returns error if the input doesn't match any known MAC format.
func normalizeMac(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	matched := false
	for _, p := range macPatterns {
		if p.MatchString(trimmed) {
			matched = true
			break
		}
	}
	if !matched {
		return "", fmt.Errorf("invalid MAC address format: %s", input)
	}
	// Remove all separators
	r := strings.NewReplacer(":", "", "-", "", ".", "")
	hex := strings.ToUpper(r.Replace(trimmed))
	if len(hex) != 12 {
		return "", fmt.Errorf("invalid MAC address length: %s", input)
	}
	return hex, nil
}

// formatMac formats a 12-char hex string as AA:BB:CC:DD:EE:FF.
func formatMac(hex string) string {
	parts := make([]string, 6)
	for i := 0; i < 6; i++ {
		parts[i] = hex[i*2 : i*2+2]
	}
	return strings.Join(parts, ":")
}

// formatPrefix formats a hex prefix as colon-separated pairs (e.g. "AA:BB:CC").
func formatPrefix(hex string) string {
	var parts []string
	for i := 0; i+1 < len(hex); i += 2 {
		parts = append(parts, hex[i:i+2])
	}
	return strings.Join(parts, ":")
}

// macAddressType returns "unicast" or "multicast" based on bit 0 of the first octet.
func macAddressType(hex string) string {
	b := hexVal(hex[1])
	if b&1 == 1 {
		return "multicast"
	}
	return "unicast"
}

// macScope returns "global" or "local" based on bit 1 of the first octet (UAA/LAA).
func macScope(hex string) string {
	b := hexVal(hex[1])
	if b&2 == 2 {
		return "local"
	}
	return "global"
}

func hexVal(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	}
	return 0
}

// MacLookup performs a MAC address vendor lookup using the IEEE OUI database.
func MacLookup(ctx context.Context, target string, ouiDir string) (*MacLookupResult, error) {
	hex, err := normalizeMac(target)
	if err != nil {
		return nil, err
	}

	// Ensure OUI files are fresh
	cacheAge, err := ensureOUIFiles(ctx, ouiDir)
	if err != nil {
		return nil, fmt.Errorf("OUI database unavailable: %w", err)
	}

	// Search across all three registries (MA-L first, then MA-M, then MA-S)
	// MA-L uses first 6 hex chars (24 bits), MA-M uses 7 (28 bits), MA-S uses 9 (36 bits)
	prefixLengths := []struct {
		hexLen   int
		file     string
	}{
		{6, "oui.csv"},    // MA-L: 24-bit
		{7, "mam.csv"},    // MA-M: 28-bit
		{9, "oui36.csv"},  // MA-S: 36-bit
	}

	for _, pl := range prefixLengths {
		prefix := hex[:pl.hexLen]
		entry, err := searchOUIFile(filepath.Join(ouiDir, pl.file), prefix)
		if err != nil {
			continue
		}
		if entry != nil {
			result := &MacLookupResult{
				MAC:         formatMac(hex),
				OUIPrefix:   formatPrefix(entry.Prefix),
				Vendor:      entry.Vendor,
				Address:     entry.Address,
				Registry:    entry.Registry,
				AddressType: macAddressType(hex),
				Scope:       macScope(hex),
				CacheAge:    cacheAge,
			}

			// Geocode vendor address
			if entry.Address != "" {
				lat, lon, geoErr := geocodeAddress(ctx, entry.Address)
				if geoErr == nil {
					result.Latitude = &lat
					result.Longitude = &lon
				}
			}

			return result, nil
		}
	}

	// Not found in any registry
	return &MacLookupResult{
		MAC:         formatMac(hex),
		OUIPrefix:   formatPrefix(hex[:6]),
		Vendor:      "Unknown",
		Registry:    "N/A",
		AddressType: macAddressType(hex),
		Scope:       macScope(hex),
		CacheAge:    cacheAge,
	}, nil
}

// ensureOUIFiles checks if cached CSV files are fresh, downloads them if not.
// Returns a human-readable cache age string.
func ensureOUIFiles(ctx context.Context, ouiDir string) (string, error) {
	if err := os.MkdirAll(ouiDir, 0755); err != nil {
		return "", fmt.Errorf("create OUI dir: %w", err)
	}

	// Check if all files exist and are fresh
	allFresh := true
	var oldestMod time.Time
	for _, f := range ouiFiles {
		path := filepath.Join(ouiDir, f.Name)
		info, err := os.Stat(path)
		if err != nil || time.Since(info.ModTime()) > ouiCacheTTL {
			allFresh = false
			break
		}
		if oldestMod.IsZero() || info.ModTime().Before(oldestMod) {
			oldestMod = info.ModTime()
		}
	}

	if allFresh {
		return formatCacheAge(oldestMod), nil
	}

	// Download fresh files
	downloadErr := downloadOUIFiles(ctx, ouiDir)
	if downloadErr != nil {
		// Check if stale files exist as fallback
		stalePath := filepath.Join(ouiDir, ouiFiles[0].Name)
		if info, err := os.Stat(stalePath); err == nil {
			return formatCacheAge(info.ModTime()) + " (stale)", nil
		}
		return "", downloadErr
	}

	return "just updated", nil
}

// downloadOUIFiles downloads all three IEEE CSV files to the given directory.
func downloadOUIFiles(ctx context.Context, ouiDir string) error {
	client := &http.Client{Timeout: 30 * time.Second}

	for _, f := range ouiFiles {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.URL, nil)
		if err != nil {
			return fmt.Errorf("create request for %s: %w", f.Name, err)
		}
		req.Header.Set("User-Agent", "NetScope/1.0")

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("download %s: %w", f.Name, err)
		}

		tmpPath := filepath.Join(ouiDir, f.Name+".tmp")
		out, err := os.Create(tmpPath)
		if err != nil {
			resp.Body.Close()
			return fmt.Errorf("create temp file for %s: %w", f.Name, err)
		}

		_, copyErr := io.Copy(out, resp.Body)
		resp.Body.Close()
		out.Close()

		if copyErr != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("write %s: %w", f.Name, copyErr)
		}

		// Atomic replace
		finalPath := filepath.Join(ouiDir, f.Name)
		if err := os.Rename(tmpPath, finalPath); err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("rename %s: %w", f.Name, err)
		}
	}
	return nil
}

// searchOUIFile searches a single IEEE CSV file for a matching prefix.
func searchOUIFile(path string, prefix string) (*ouiEntry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	// Skip header
	if _, err := reader.Read(); err != nil {
		return nil, err
	}

	upperPrefix := strings.ToUpper(prefix)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(record) < 3 {
			continue
		}
		// CSV format: Registry, Assignment, Organization Name, Organization Address
		assignment := strings.ToUpper(strings.TrimSpace(record[1]))
		if assignment == upperPrefix {
			entry := &ouiEntry{
				Registry: strings.TrimSpace(record[0]),
				Prefix:   assignment,
				Vendor:   strings.TrimSpace(record[2]),
			}
			if len(record) >= 4 {
				entry.Address = strings.TrimSpace(record[3])
			}
			return entry, nil
		}
	}
	return nil, nil
}

// geocodeAddress uses Nominatim to convert a street address to lat/lon.
func geocodeAddress(ctx context.Context, address string) (float64, float64, error) {
	client := &http.Client{Timeout: 5 * time.Second}

	url := fmt.Sprintf("https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=1",
		strings.ReplaceAll(strings.ReplaceAll(address, " ", "+"), ",", "+"))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("User-Agent", "NetScope/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("nominatim returned status %d", resp.StatusCode)
	}

	var results []struct {
		Lat string `json:"lat"`
		Lon string `json:"lon"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return 0, 0, err
	}
	if len(results) == 0 {
		return 0, 0, fmt.Errorf("no geocoding results for address")
	}

	var lat, lon float64
	fmt.Sscanf(results[0].Lat, "%f", &lat)
	fmt.Sscanf(results[0].Lon, "%f", &lon)

	if lat == 0 && lon == 0 {
		return 0, 0, fmt.Errorf("geocoding returned zero coordinates")
	}

	return lat, lon, nil
}

// formatCacheAge returns a human-readable string for how old the cache is.
func formatCacheAge(modTime time.Time) string {
	age := time.Since(modTime)
	switch {
	case age < time.Minute:
		return "just updated"
	case age < time.Hour:
		return fmt.Sprintf("%dm ago", int(age.Minutes()))
	default:
		return fmt.Sprintf("%dh ago", int(age.Hours()))
	}
}
```

Note: this file needs `"encoding/json"` in the imports for the geocode function. Add it to the import block:

```go
import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/barto/docker/netscope && go build ./internal/tools/`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add internal/tools/maclookup.go
git commit -m "feat(maclookup): add MAC lookup tool with OUI cache and geocoding"
```

---

### Task 3: Add `maclookup` to validation and dispatcher

**Files:**
- Modify: `internal/tools/validate.go:15-27`
- Modify: `internal/tools/validate.go:41-82`
- Modify: `internal/worker/dispatcher.go:18-22`
- Modify: `internal/worker/dispatcher.go:85-253`

- [ ] **Step 1: Add `maclookup` to `validScanTypes` in validate.go**

In `internal/tools/validate.go`, add `"maclookup": true` to the map:

```go
var validScanTypes = map[string]bool{
	"ping":        true,
	"traceroute":  true,
	"mtr":         true,
	"dns":         true,
	"whois":       true,
	"portscan":    true,
	"vulnscan":    true,
	"vulnexploit": true,
	"pentest":     true,
	"ssl":         true,
	"headers":     true,
	"maclookup":   true,
}
```

- [ ] **Step 2: Add MAC-specific validation in ValidateTarget**

The current `ValidateTarget` only accepts IPs, CIDRs, and domains. For `maclookup`, the target is a MAC address which will fail validation. We need to handle this at the API layer. The simplest approach: skip `ValidateTarget` for `maclookup` in `internal/api/scans.go`.

In `internal/api/scans.go`, modify the `CreateScan` handler to skip target validation for maclookup (since MAC addresses aren't IPs or domains):

```go
// CreateScan handles POST /api/scans.
func (s *Server) CreateScan(w http.ResponseWriter, r *http.Request) {
	var req CreateScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if err := tools.ValidateScanType(req.Type); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// MAC lookup validates its own target format (MAC address, not IP/domain)
	if req.Type != "maclookup" {
		if err := tools.ValidateTarget(req.Target); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	scan, err := models.CreateScan(r.Context(), s.DB, req.Type, req.Target, req.Options)
	if err != nil {
		http.Error(w, "failed to create scan", http.StatusInternalServerError)
		return
	}

	job := queue.ScanJob{
		ScanID:  scan.ID,
		Type:    scan.Type,
		Target:  scan.Target,
		Options: scan.Options,
	}
	if err := s.Queue.PublishJob(job); err != nil {
		// Log but don't fail — scan is created
		_ = err
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(scan)
}
```

- [ ] **Step 3: Add `OUIDir` field to Dispatcher struct**

In `internal/worker/dispatcher.go`, add `OUIDir` to the struct:

```go
// Dispatcher receives scan jobs and dispatches them to the appropriate tool.
type Dispatcher struct {
	DB      *database.DB
	Queue   queue.JobQueue
	RepoMgr *secrepos.Manager
	OUIDir  string
}
```

- [ ] **Step 4: Add `maclookup` case to dispatcher execute()**

In `internal/worker/dispatcher.go`, add the case before the `default:` line:

```go
	case "maclookup":
		res, err := tools.MacLookup(ctx, target, d.OUIDir)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	default:
		return nil, fmt.Errorf("unknown scan type: %s", job.Type)
	}
```

- [ ] **Step 5: Pass OUIDir when creating dispatcher in worker main.go**

In `cmd/worker/main.go`, update the dispatcher creation:

```go
	// Create dispatcher
	dispatcher := &worker.Dispatcher{
		DB:      db,
		Queue:   q,
		RepoMgr: repoMgr,
		OUIDir:  cfg.OUIDir,
	}
```

- [ ] **Step 6: Verify everything compiles**

Run: `cd /home/barto/docker/netscope && go build ./...`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add internal/tools/validate.go internal/api/scans.go internal/worker/dispatcher.go cmd/worker/main.go
git commit -m "feat(maclookup): integrate MAC lookup into scan pipeline"
```

---

### Task 4: Create frontend page `MacLookup.tsx`

**Files:**
- Create: `frontend/src/pages/MacLookup.tsx`

- [ ] **Step 1: Create the page component**

Create `frontend/src/pages/MacLookup.tsx`:

```tsx
import { type FormEvent, useEffect, useRef, useState } from 'react'
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
        <span className="text-xs w-32 shrink-0 pt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}>
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
      description="Identify hardware vendor from a MAC address using the IEEE OUI database"
      scan={scan}
      polling={polling}
      submitting={submitting}
      error={error}
      result={
        scan?.result && scan.status === 'completed' ? (
          <div className="flex flex-col gap-4">
            {/* Result card */}
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

            {/* Map */}
            {result?.latitude != null && result?.longitude != null && (
              <VendorMap
                lat={result.latitude}
                lon={result.longitude}
                vendor={result.vendor ?? 'Unknown'}
                address={result.address ?? ''}
              />
            )}
          </div>
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
          <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
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

// VendorMap displays a Leaflet map centered on the vendor's location.
function VendorMap({ lat, lon, vendor, address }: { lat: number; lon: number; vendor: string; address: string }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current) return

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

    const icon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:32px;height:32px">
          <div style="
            position:absolute;inset:0;border-radius:50%;
            background:radial-gradient(circle,#0ea5e940 0%,#0ea5e910 50%,transparent 70%);
            animation:pulse-glow 2s ease-in-out infinite;
          "></div>
          <div style="
            position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:10px;height:10px;background:#0ea5e9;border-radius:50%;
            border:2px solid rgba(255,255,255,0.6);
            box-shadow:0 0 10px #0ea5e9,0 0 20px #0ea5e960;
          "></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })

    const marker = L.marker([lat, lon], { icon }).addTo(map)

    marker.bindPopup(`
      <div style="
        font-family:'IBM Plex Mono',monospace;font-size:11px;min-width:200px;
        color:#e8edf5;background:linear-gradient(135deg,#0b0f18,#0f1420);
        padding:14px;border-radius:10px;border:1px solid #0ea5e930;
        box-shadow:0 0 30px #0ea5e915,0 4px 20px rgba(0,0,0,0.5);
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:#0ea5e9;box-shadow:0 0 8px #0ea5e9"></div>
          <span style="font-size:12px;font-weight:600;color:#0ea5e9">${vendor}</span>
        </div>
        ${address ? `<div style="color:#7a8ba8;font-size:10px;line-height:1.4">${address}</div>` : ''}
      </div>
    `, { className: 'netscope-popup', closeButton: false, offset: [0, -5] })

    leafletMap.current = map

    return () => {
      map.remove()
      leafletMap.current = null
    }
  }, [lat, lon, vendor, address])

  return (
    <div className="rounded-xl overflow-hidden" style={{
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
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

Run: `cd /home/barto/docker/netscope/frontend && npx tsc --noEmit`
Expected: No errors related to `MacLookup.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MacLookup.tsx
git commit -m "feat(maclookup): add MAC Lookup frontend page with vendor map"
```

---

### Task 5: Add route and sidebar navigation

**Files:**
- Modify: `frontend/src/App.tsx:1-17` (imports)
- Modify: `frontend/src/App.tsx:25-32` (routes)
- Modify: `frontend/src/components/Sidebar.tsx:23-30`

- [ ] **Step 1: Add import and route in App.tsx**

In `frontend/src/App.tsx`, add the import after the existing page imports:

```tsx
import { MacLookup } from './pages/MacLookup'
```

Add the route inside the Network routes section, after the `whois` route:

```tsx
          <Route path="whois" element={<Whois />} />
          <Route path="mac-lookup" element={<MacLookup />} />
```

- [ ] **Step 2: Add sidebar entry in Sidebar.tsx**

In `frontend/src/components/Sidebar.tsx`, add to the Network group items array, after the NetPath entry:

```tsx
      { label: 'MAC Lookup', to: '/mac-lookup', icon: '⎔' },
```

The full Network items array should be:

```tsx
    {
      title: 'Network',
      items: [
        { label: 'Ping', to: '/diagnostic', icon: '◎' },
        { label: 'Port Scanner', to: '/port-scanner', icon: '⊞' },
        { label: 'Traceroute / MTR', to: '/traceroute', icon: '⇢' },
        { label: 'DNS Lookup', to: '/dns', icon: '◈' },
        { label: 'Whois', to: '/whois', icon: '◇' },
        { label: 'NetPath', to: '/netpath', icon: '⟿' },
        { label: 'MAC Lookup', to: '/mac-lookup', icon: '⎔' },
      ],
    },
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd /home/barto/docker/netscope/frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(maclookup): add MAC Lookup route and sidebar navigation"
```

---

### Task 6: End-to-end test with Docker

- [ ] **Step 1: Build and start containers**

Run: `cd /home/barto/docker/netscope && docker compose up --build -d`
Expected: All 4 services start (postgres, nats, api, worker). Check with `docker compose ps`.

- [ ] **Step 2: Verify the API accepts maclookup scans**

Run: `curl -s -X POST http://localhost:8080/api/scans -H 'Content-Type: application/json' -d '{"type":"maclookup","target":"00:1A:2B:3C:4D:5E"}' | jq .`
Expected: Returns a scan object with `"type":"maclookup"`, `"status":"pending"`, and an `id`.

- [ ] **Step 3: Poll for result**

Run: `curl -s http://localhost:8080/api/scans/<SCAN_ID> | jq .`
Expected: After a few seconds, status is `"completed"` and `result` contains `mac`, `vendor`, `oui_prefix`, `registry`, `address_type`, `scope` fields.

- [ ] **Step 4: Test the frontend**

Open `http://localhost:8080/mac-lookup` in a browser. Enter `00:1A:2B:3C:4D:5E` and click "MAC Lookup". Verify:
- Result card shows all fields
- Map displays vendor location (if geocoding succeeded)
- Sidebar shows "MAC Lookup" in the Network section

- [ ] **Step 5: Test invalid MAC format**

Run: `curl -s -X POST http://localhost:8080/api/scans -H 'Content-Type: application/json' -d '{"type":"maclookup","target":"not-a-mac"}' | jq .`
Expected: Scan is created (validation happens in worker). After polling, status should be `"failed"` with error about invalid MAC format.

- [ ] **Step 6: Test different MAC formats**

Test all 4 supported formats in the UI:
- `00:1A:2B:3C:4D:5E` (colon)
- `00-1A-2B-3C-4D-5E` (dash)
- `001A.2B3C.4D5E` (Cisco)
- `001A2B3C4D5E` (no separator)

All should return the same vendor result.

- [ ] **Step 7: Commit any fixes**

If any issues were found and fixed during testing, commit the fixes.
