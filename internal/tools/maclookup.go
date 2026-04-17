package tools

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

const ouiCacheTTL = 24 * time.Hour

// MAC address validation patterns.
var macPatterns = []*regexp.Regexp{
	regexp.MustCompile(`^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$`),  // colon
	regexp.MustCompile(`^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$`),  // dash
	regexp.MustCompile(`^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$`), // Cisco dot notation
	regexp.MustCompile(`^[0-9A-Fa-f]{12}$`),                      // no separator
}

// MacLookupResult holds the result of a MAC address OUI lookup.
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

type ouiEntry struct {
	Registry string
	Prefix   string
	Vendor   string
	Address  string
}

type ouiFile struct {
	Name string
	URL  string
}

var ouiFiles = []ouiFile{
	{Name: "oui.csv", URL: "https://standards-oui.ieee.org/oui/oui.csv"},
	{Name: "mam.csv", URL: "https://standards-oui.ieee.org/oui28/mam.csv"},
	{Name: "oui36.csv", URL: "https://standards-oui.ieee.org/oui36/oui36.csv"},
}

// normalizeMac strips separators and returns a 12-character uppercase hex string.
func normalizeMac(input string) (string, error) {
	// Check against known formats.
	valid := false
	for _, pat := range macPatterns {
		if pat.MatchString(input) {
			valid = true
			break
		}
	}
	if !valid {
		return "", fmt.Errorf("invalid MAC address format: %q", input)
	}

	// Strip separators.
	stripped := strings.NewReplacer(":", "", "-", "", ".", "").Replace(input)
	return strings.ToUpper(stripped), nil
}

// formatMac formats a 12-char hex string as AA:BB:CC:DD:EE:FF.
func formatMac(hex string) string {
	if len(hex) != 12 {
		return hex
	}
	return fmt.Sprintf("%s:%s:%s:%s:%s:%s",
		hex[0:2], hex[2:4], hex[4:6], hex[6:8], hex[8:10], hex[10:12])
}

// formatPrefix formats a hex prefix string with colons (every 2 chars).
func formatPrefix(hex string) string {
	var parts []string
	for i := 0; i+2 <= len(hex); i += 2 {
		parts = append(parts, hex[i:i+2])
	}
	return strings.Join(parts, ":")
}

// macAddressType returns "unicast" or "multicast" based on bit 0 of the first octet.
func macAddressType(hex string) string {
	if len(hex) < 2 {
		return "unknown"
	}
	firstOctet := (hexVal(hex[0]) << 4) | hexVal(hex[1])
	if firstOctet&0x01 != 0 {
		return "multicast"
	}
	return "unicast"
}

// macScope returns "global" or "local" based on bit 1 of the first octet.
func macScope(hex string) string {
	if len(hex) < 2 {
		return "unknown"
	}
	firstOctet := (hexVal(hex[0]) << 4) | hexVal(hex[1])
	if firstOctet&0x02 != 0 {
		return "local"
	}
	return "global"
}

// hexVal converts a hex character to its numeric value.
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

// MacLookup is the main entry point for MAC address OUI lookup.
func MacLookup(ctx context.Context, target string, ouiDir string) (*MacLookupResult, error) {
	// Validate and normalize.
	normalized, err := normalizeMac(target)
	if err != nil {
		return nil, err
	}

	// Ensure OUI files are present and fresh.
	cacheAge, err := ensureOUIFiles(ctx, ouiDir)
	if err != nil {
		return nil, fmt.Errorf("OUI database unavailable: %w", err)
	}

	// Search MA-L (6 hex chars prefix), MA-M (7 hex chars), MA-S (9 hex chars).
	prefixLengths := []int{6, 7, 9}
	fileNames := []string{"oui.csv", "mam.csv", "oui36.csv"}

	var entry *ouiEntry
	var matchedPrefix string

	for i, prefLen := range prefixLengths {
		if len(normalized) < prefLen {
			continue
		}
		prefix := normalized[:prefLen]
		fpath := filepath.Join(ouiDir, fileNames[i])
		e, err := searchOUIFile(fpath, prefix)
		if err == nil && e != nil {
			entry = e
			matchedPrefix = prefix
			break
		}
	}

	result := &MacLookupResult{
		MAC:         formatMac(normalized),
		AddressType: macAddressType(normalized),
		Scope:       macScope(normalized),
		CacheAge:    cacheAge,
	}

	if entry != nil {
		result.OUIPrefix = formatPrefix(matchedPrefix)
		result.Vendor = entry.Vendor
		result.Address = entry.Address
		result.Registry = entry.Registry
	} else {
		result.OUIPrefix = formatPrefix(normalized[:6])
		result.Vendor = "Unknown"
	}

	// Geocode address (non-blocking; omit lat/lon on failure).
	if result.Address != "" {
		lat, lon, geoErr := geocodeAddress(ctx, result.Address)
		if geoErr == nil {
			latCopy := lat
			lonCopy := lon
			result.Latitude = &latCopy
			result.Longitude = &lonCopy
		}
	}

	return result, nil
}

// ensureOUIFiles checks if OUI CSVs are cached and fresh; downloads if needed.
// Returns a human-readable cache age string.
func ensureOUIFiles(ctx context.Context, ouiDir string) (string, error) {
	if err := os.MkdirAll(ouiDir, 0755); err != nil {
		return "", fmt.Errorf("cannot create OUI directory: %w", err)
	}

	// Check if all files exist and are fresh.
	allFresh := true
	var oldestMod time.Time
	for _, f := range ouiFiles {
		fpath := filepath.Join(ouiDir, f.Name)
		info, err := os.Stat(fpath)
		if err != nil {
			allFresh = false
			break
		}
		if time.Since(info.ModTime()) > ouiCacheTTL {
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

	// Need to download.
	downloadErr := downloadOUIFiles(ctx, ouiDir)
	if downloadErr == nil {
		return "just updated", nil
	}

	// Download failed — check if stale files exist as fallback.
	allExist := true
	var staleMod time.Time
	for _, f := range ouiFiles {
		fpath := filepath.Join(ouiDir, f.Name)
		info, err := os.Stat(fpath)
		if err != nil {
			allExist = false
			break
		}
		if staleMod.IsZero() || info.ModTime().Before(staleMod) {
			staleMod = info.ModTime()
		}
	}

	if allExist {
		return formatCacheAge(staleMod) + " (stale)", nil
	}

	return "", downloadErr
}

// downloadOUIFiles downloads all 3 IEEE OUI CSV files atomically.
func downloadOUIFiles(ctx context.Context, ouiDir string) error {
	client := &http.Client{Timeout: 60 * time.Second}

	for _, f := range ouiFiles {
		tmpPath := filepath.Join(ouiDir, f.Name+".tmp")
		destPath := filepath.Join(ouiDir, f.Name)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.URL, nil)
		if err != nil {
			return fmt.Errorf("building request for %s: %w", f.Name, err)
		}
		req.Header.Set("User-Agent", "NetScope/1.0")

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("downloading %s: %w", f.Name, err)
		}

		if err := func() error {
			defer resp.Body.Close()

			out, err := os.Create(tmpPath)
			if err != nil {
				return err
			}

			_, copyErr := io.Copy(out, resp.Body)
			closeErr := out.Close()

			if copyErr != nil {
				os.Remove(tmpPath)
				return copyErr
			}
			if closeErr != nil {
				os.Remove(tmpPath)
				return closeErr
			}
			return nil
		}(); err != nil {
			return fmt.Errorf("writing %s: %w", f.Name, err)
		}

		if err := os.Rename(tmpPath, destPath); err != nil {
			os.Remove(tmpPath)
			return fmt.Errorf("renaming %s: %w", f.Name, err)
		}
	}

	return nil
}

// searchOUIFile searches a CSV file for a matching OUI prefix.
// The prefix is compared case-insensitively against the "Assignment" column.
func searchOUIFile(path string, prefix string) (*ouiEntry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1 // allow variable fields

	// Skip header row.
	if _, err := r.Read(); err != nil {
		return nil, err
	}

	upperPrefix := strings.ToUpper(prefix)

	for {
		record, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(record) < 3 {
			continue
		}
		// CSV columns: Registry, Assignment, Organization Name, Organization Address
		assignment := strings.ToUpper(strings.TrimSpace(record[1]))
		if assignment == upperPrefix {
			entry := &ouiEntry{
				Registry: strings.TrimSpace(record[0]),
				Prefix:   assignment,
				Vendor:   strings.TrimSpace(record[2]),
			}
			if len(record) > 3 {
				entry.Address = strings.TrimSpace(record[3])
			}
			return entry, nil
		}
	}

	return nil, nil
}

// geocodeAddress looks up latitude/longitude for a vendor address using Nominatim.
func geocodeAddress(ctx context.Context, address string) (float64, float64, error) {
	// URL-encode: replace spaces and commas with +.
	encoded := strings.NewReplacer(" ", "+", ",", "+").Replace(address)
	url := "https://nominatim.openstreetmap.org/search?q=" + encoded + "&format=json&limit=1"

	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(timeoutCtx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("User-Agent", "NetScope/1.0")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()

	var results []struct {
		Lat string `json:"lat"`
		Lon string `json:"lon"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return 0, 0, err
	}
	if len(results) == 0 {
		return 0, 0, fmt.Errorf("no geocoding results")
	}

	var lat, lon float64
	if _, err := fmt.Sscanf(results[0].Lat, "%f", &lat); err != nil {
		return 0, 0, err
	}
	if _, err := fmt.Sscanf(results[0].Lon, "%f", &lon); err != nil {
		return 0, 0, err
	}

	return lat, lon, nil
}

// formatCacheAge returns a human-readable string for how long ago a file was modified.
func formatCacheAge(modTime time.Time) string {
	age := time.Since(modTime)
	switch {
	case age < time.Minute:
		return fmt.Sprintf("%ds ago", int(age.Seconds()))
	case age < time.Hour:
		return fmt.Sprintf("%dm ago", int(age.Minutes()))
	case age < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(age.Hours()))
	default:
		days := int(age.Hours() / 24)
		return fmt.Sprintf("%dd ago", days)
	}
}
