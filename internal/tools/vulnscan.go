package tools

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/barto/netscope/internal/secrepos"
)

// VulnFinding represents a single vulnerability finding.
type VulnFinding struct {
	ID               string `json:"id"`
	Severity         string `json:"severity"` // critical, high, medium, low, info
	Category         string `json:"category"` // sensitive_files, cors, cookies, info_disclosure, dns_security, http_methods, dir_listing, open_redirect, subdomains, waf, banner, sqli, xss, ssrf, api_discovery
	Title            string `json:"title"`
	Description      string `json:"description"`
	Remediation      string `json:"remediation,omitempty"`
	Evidence         string `json:"evidence,omitempty"`
	URL              string `json:"url,omitempty"`
	ExploitAvailable bool   `json:"exploit_available"`
	ExploitType      string `json:"exploit_type,omitempty"` // used by vulnexploit to know what to do
}

// VulnScanResult holds the combined vulnerability scan results.
type VulnScanResult struct {
	Target   string      `json:"target"`
	Grade    string      `json:"grade"`
	Summary  VulnSummary `json:"summary"`
	Findings []VulnFinding `json:"findings"`
	Modules  []ModuleResult `json:"modules"`
	Duration float64     `json:"duration_sec"`
}

// VulnSummary holds counts by severity.
type VulnSummary struct {
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Info     int `json:"info"`
	Total    int `json:"total"`
}

// ModuleResult tracks per-module scan status.
type ModuleResult struct {
	Name     string  `json:"name"`
	Status   string  `json:"status"` // ok, error, skipped
	Duration float64 `json:"duration_sec"`
	Findings int     `json:"findings"`
	Error    string  `json:"error,omitempty"`
}

// ModuleProgress is sent after each module completes.
type ModuleProgress struct {
	Module   string  `json:"module"`
	Index    int     `json:"index"`
	Total    int     `json:"total"`
	Status   string  `json:"status"`
	Findings int     `json:"findings"`
	Duration float64 `json:"duration_sec"`
}

// VulnScanOptions configures the vulnerability scan.
type VulnScanOptions struct {
	NucleiDir   string
	PayloadsDir string
	SecListsDir string
}

// VulnScan runs a comprehensive vulnerability scan.
// onProgress is called after each module completes (may be nil).
func VulnScan(ctx context.Context, target string, opts VulnScanOptions, onProgress func(ModuleProgress)) (*VulnScanResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, err
	}

	cleanTarget := StripURLScheme(target)
	start := time.Now()
	result := &VulnScanResult{
		Target:   cleanTarget,
		Findings: []VulnFinding{},
		Modules:  []ModuleResult{},
	}

	findingID := 0
	nextID := func() string {
		findingID++
		return fmt.Sprintf("vuln-%d", findingID)
	}

	type module struct {
		name string
		fn   func() []VulnFinding
	}

	baseURL := "https://" + cleanTarget

	modules := []module{
		{"Sensitive Files", func() []VulnFinding { return scanSensitiveFiles(ctx, baseURL, nextID) }},
		{"CORS Misconfiguration", func() []VulnFinding { return scanCORS(ctx, baseURL, nextID) }},
		{"Cookie Security", func() []VulnFinding { return scanCookies(ctx, baseURL, nextID) }},
		{"Information Disclosure", func() []VulnFinding { return scanInfoDisclosure(ctx, baseURL, nextID) }},
		{"DNS Security", func() []VulnFinding { return scanDNSSecurity(ctx, cleanTarget, nextID) }},
		{"HTTP Methods", func() []VulnFinding { return scanHTTPMethods(ctx, baseURL, nextID) }},
		{"Directory Listing", func() []VulnFinding { return scanDirListing(ctx, baseURL, nextID) }},
		{"Open Redirect", func() []VulnFinding { return scanOpenRedirect(ctx, baseURL, nextID) }},
		{"Subdomain Enumeration", func() []VulnFinding { return scanSubdomains(ctx, cleanTarget, nextID) }},
		{"WAF Detection", func() []VulnFinding { return scanWAF(ctx, baseURL, cleanTarget, nextID) }},
		{"Banner Grabbing", func() []VulnFinding { return scanBannerGrab(ctx, cleanTarget, nextID) }},
		{"SQLi Probing", func() []VulnFinding { return scanSQLi(ctx, baseURL, nextID) }},
		{"XSS Probing", func() []VulnFinding { return scanXSS(ctx, baseURL, nextID) }},
		{"SSRF Detection", func() []VulnFinding { return scanSSRF(ctx, baseURL, nextID) }},
		{"API Discovery", func() []VulnFinding { return scanAPIDiscovery(ctx, baseURL, nextID) }},
	}

	if opts.NucleiDir != "" {
		modules = append(modules, module{"CVE Detection (Nuclei)", func() []VulnFinding {
			return scanWithNuclei(ctx, baseURL, cleanTarget, opts.NucleiDir, nextID)
		}})
	}

	for i, m := range modules {
		if ctx.Err() != nil {
			// Context cancelled (timeout) — mark remaining modules as skipped
			for j := i; j < len(modules); j++ {
				result.Modules = append(result.Modules, ModuleResult{
					Name:   modules[j].name,
					Status: "skipped",
				})
			}
			break
		}

		mStart := time.Now()
		findings := m.fn()
		mr := ModuleResult{
			Name:     m.name,
			Status:   "ok",
			Duration: time.Since(mStart).Seconds(),
			Findings: len(findings),
		}
		result.Findings = append(result.Findings, findings...)
		result.Modules = append(result.Modules, mr)

		if onProgress != nil {
			onProgress(ModuleProgress{
				Module:   m.name,
				Index:    i + 1,
				Total:    len(modules),
				Status:   mr.Status,
				Findings: mr.Findings,
				Duration: mr.Duration,
			})
		}
	}

	// Count by severity
	for _, f := range result.Findings {
		switch f.Severity {
		case "critical":
			result.Summary.Critical++
		case "high":
			result.Summary.High++
		case "medium":
			result.Summary.Medium++
		case "low":
			result.Summary.Low++
		case "info":
			result.Summary.Info++
		}
		result.Summary.Total++
	}

	// Grade
	switch {
	case result.Summary.Critical > 0:
		result.Grade = "F"
	case result.Summary.High > 1:
		result.Grade = "D"
	case result.Summary.High > 0:
		result.Grade = "C"
	case result.Summary.Medium > 2:
		result.Grade = "C"
	case result.Summary.Medium > 0:
		result.Grade = "B"
	default:
		result.Grade = "A"
	}

	result.Duration = time.Since(start).Seconds()
	return result, nil
}

// ---------- HTTP helpers ----------

func vulnHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
}

func vulnHTTPClientNoRedirect() *http.Client {
	return &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func doGet(ctx context.Context, client *http.Client, url string) (*http.Response, string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NetScope/1.0; Security Scanner)")
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	// Read body with a 5s deadline to avoid slow-drip responses blocking forever
	type readResult struct {
		body []byte
		err  error
	}
	ch := make(chan readResult, 1)
	go func() {
		b, e := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		ch <- readResult{b, e}
	}()

	select {
	case <-ctx.Done():
		return nil, "", ctx.Err()
	case r := <-ch:
		return resp, string(r.body), r.err
	}
}

// ---------- Module 1: Sensitive Files ----------

func scanSensitiveFiles(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	type probe struct {
		path     string
		desc     string
		severity string
		markers  []string // if body contains any of these, it's a hit
	}

	probes := []probe{
		{".env", "Environment file with secrets", "critical", []string{"DB_", "PASSWORD", "SECRET", "API_KEY", "APP_KEY", "DATABASE_URL"}},
		{".git/config", "Git repository exposed", "high", []string{"[core]", "[remote", "repositoryformatversion"}},
		{".git/HEAD", "Git HEAD reference exposed", "high", []string{"ref: refs/"}},
		{".htaccess", "Apache configuration exposed", "medium", []string{"RewriteEngine", "RewriteRule", "Deny from", "AuthType"}},
		{".htpasswd", "Password file exposed", "critical", []string{":$", ":{SHA}", ":$apr1$"}},
		{".DS_Store", "macOS directory metadata", "low", []string{"Bud1"}},
		{"wp-config.php.bak", "WordPress config backup", "critical", []string{"DB_NAME", "DB_PASSWORD", "DB_HOST"}},
		{"wp-admin/", "WordPress admin panel", "info", []string{"wp-login", "WordPress"}},
		{"phpinfo.php", "PHP info page exposed", "high", []string{"phpinfo()", "PHP Version", "php.ini"}},
		{"server-status", "Apache server-status", "medium", []string{"Apache Server Status", "Total accesses"}},
		{"server-info", "Apache server-info", "medium", []string{"Apache Server Information", "Server Version"}},
		{".svn/entries", "SVN repository exposed", "high", []string{"dir", "svn"}},
		{".svn/wc.db", "SVN database exposed", "high", []string{"SQLite"}},
		{"backup.zip", "Backup archive accessible", "high", []string{"PK"}},
		{"backup.tar.gz", "Backup archive accessible", "high", nil},
		{"backup.sql", "Database dump accessible", "critical", []string{"INSERT INTO", "CREATE TABLE", "DROP TABLE"}},
		{"dump.sql", "Database dump accessible", "critical", []string{"INSERT INTO", "CREATE TABLE", "DROP TABLE"}},
		{"database.sql", "Database dump accessible", "critical", []string{"INSERT INTO", "CREATE TABLE", "DROP TABLE"}},
		{"admin/", "Admin panel accessible", "info", []string{"admin", "login", "dashboard"}},
		{"administrator/", "Admin panel accessible", "info", []string{"admin", "login", "dashboard"}},
		{"robots.txt", "Robots.txt with sensitive paths", "info", []string{"Disallow:"}},
		{"sitemap.xml", "Sitemap exposed", "info", []string{"<urlset", "<sitemapindex"}},
		{"crossdomain.xml", "Flash cross-domain policy", "low", []string{"cross-domain-policy", "allow-access-from"}},
		{"security.txt", "Security contact info", "info", []string{"Contact:"}},
		{".well-known/security.txt", "Security contact info", "info", []string{"Contact:"}},
		{"elmah.axd", "ELMAH error log exposed", "high", []string{"Error Log", "ELMAH"}},
		{"trace.axd", ".NET trace exposed", "high", []string{"Application Trace", "Request Details"}},
		{"web.config", "IIS config exposed", "high", []string{"configuration", "connectionStrings"}},
		{"config.php", "PHP config exposed", "high", []string{"<?php", "password", "database"}},
		{"config.yml", "YAML config exposed", "medium", []string{"database:", "password:", "secret:"}},
		{"config.json", "JSON config exposed", "medium", []string{"password", "secret", "apiKey"}},
		{".dockerenv", "Docker environment file", "medium", nil},
		{"Dockerfile", "Dockerfile exposed", "medium", []string{"FROM", "RUN", "EXPOSE"}},
		{"docker-compose.yml", "Docker Compose exposed", "medium", []string{"services:", "volumes:", "image:"}},
		{"package.json", "Node.js package manifest", "info", []string{"dependencies", "scripts"}},
		{"composer.json", "PHP Composer manifest", "info", []string{"require", "autoload"}},
		{"Gemfile", "Ruby Gemfile exposed", "info", []string{"source", "gem "}},
		{"requirements.txt", "Python requirements exposed", "info", []string{"=="}},
	}

	for _, p := range probes {
		if ctx.Err() != nil {
			break
		}
		url := baseURL + "/" + p.path
		resp, body, err := doGet(ctx, client, url)
		if err != nil || resp == nil {
			continue
		}
		if resp.StatusCode != 200 {
			continue
		}
		// Check markers
		if len(p.markers) > 0 {
			found := false
			for _, m := range p.markers {
				if strings.Contains(body, m) {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		// Skip large 200 responses that are likely custom 404 pages
		if len(body) < 5 {
			continue
		}

		f := VulnFinding{
			ID:          nextID(),
			Severity:    p.severity,
			Category:    "sensitive_files",
			Title:       fmt.Sprintf("Sensitive file exposed: /%s", p.path),
			Description: p.desc,
			URL:         url,
			Remediation: "Block access to this file via web server configuration or remove it from the public directory.",
		}
		if p.severity == "critical" || p.severity == "high" {
			f.ExploitAvailable = true
			f.ExploitType = "file_read"
			f.Evidence = truncate(body, 200)
		}
		findings = append(findings, f)
	}

	return findings
}

// ---------- Module 2: CORS Misconfiguration ----------

func scanCORS(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	tests := []struct {
		origin   string
		desc     string
		severity string
	}{
		{"https://evil.com", "Arbitrary origin reflected", "high"},
		{"null", "Null origin allowed", "high"},
		{baseURL + ".evil.com", "Subdomain-suffix origin reflected", "medium"},
	}

	for _, t := range tests {
		req, err := http.NewRequestWithContext(ctx, "GET", baseURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Origin", t.origin)
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NetScope/1.0)")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()

		acao := resp.Header.Get("Access-Control-Allow-Origin")
		acac := resp.Header.Get("Access-Control-Allow-Credentials")

		if acao == "*" && t.origin == "https://evil.com" {
			sev := "medium"
			if acac == "true" {
				sev = "critical"
			}
			findings = append(findings, VulnFinding{
				ID:          nextID(),
				Severity:    sev,
				Category:    "cors",
				Title:       "CORS: Wildcard Access-Control-Allow-Origin",
				Description: "The server allows requests from any origin" + credNote(acac),
				Evidence:    fmt.Sprintf("ACAO: %s, ACAC: %s", acao, acac),
				Remediation: "Restrict Access-Control-Allow-Origin to trusted domains.",
			})
			break
		}
		if acao == t.origin {
			sev := t.severity
			if acac == "true" {
				sev = "critical"
			}
			findings = append(findings, VulnFinding{
				ID:          nextID(),
				Severity:    sev,
				Category:    "cors",
				Title:       fmt.Sprintf("CORS: %s", t.desc),
				Description: fmt.Sprintf("Origin '%s' is reflected in ACAO header%s", t.origin, credNote(acac)),
				Evidence:    fmt.Sprintf("ACAO: %s, ACAC: %s", acao, acac),
				Remediation: "Validate origins against a whitelist. Never reflect arbitrary origins.",
				ExploitAvailable: acac == "true",
				ExploitType:      "cors_exploit",
			})
		}
	}

	return findings
}

func credNote(acac string) string {
	if acac == "true" {
		return " WITH credentials. This allows stealing user data cross-origin."
	}
	return "."
}

// ---------- Module 3: Cookie Security ----------

func scanCookies(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	resp, _, err := doGet(ctx, client, baseURL)
	if err != nil || resp == nil {
		return findings
	}

	for _, cookie := range resp.Cookies() {
		name := cookie.Name
		if !cookie.Secure {
			findings = append(findings, VulnFinding{
				ID:          nextID(),
				Severity:    "medium",
				Category:    "cookies",
				Title:       fmt.Sprintf("Cookie '%s' missing Secure flag", name),
				Description: "Cookie can be transmitted over unencrypted HTTP connections.",
				Remediation: "Set the Secure flag on all cookies.",
			})
		}
		if !cookie.HttpOnly {
			findings = append(findings, VulnFinding{
				ID:          nextID(),
				Severity:    "medium",
				Category:    "cookies",
				Title:       fmt.Sprintf("Cookie '%s' missing HttpOnly flag", name),
				Description: "Cookie is accessible via JavaScript, enabling XSS-based theft.",
				Remediation: "Set the HttpOnly flag on session cookies.",
			})
		}
		if cookie.SameSite == http.SameSiteDefaultMode || cookie.SameSite == 0 {
			findings = append(findings, VulnFinding{
				ID:          nextID(),
				Severity:    "low",
				Category:    "cookies",
				Title:       fmt.Sprintf("Cookie '%s' missing SameSite attribute", name),
				Description: "Cookie may be sent in cross-site requests, enabling CSRF attacks.",
				Remediation: "Set SameSite=Lax or SameSite=Strict on cookies.",
			})
		}
	}

	return findings
}

// ---------- Module 4: Information Disclosure ----------

func scanInfoDisclosure(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	resp, body, err := doGet(ctx, client, baseURL)
	if err != nil || resp == nil {
		return findings
	}

	// Server header
	server := resp.Header.Get("Server")
	if server != "" {
		sev := "info"
		if strings.ContainsAny(server, "0123456789") {
			sev = "low" // version info in server header
		}
		findings = append(findings, VulnFinding{
			ID:       nextID(),
			Severity: sev,
			Category: "info_disclosure",
			Title:    "Server header reveals technology",
			Evidence: "Server: " + server,
			Description: fmt.Sprintf("Server header: %s. Attackers use this for targeted exploits.", server),
			Remediation: "Remove or genericize the Server header.",
		})
	}

	// X-Powered-By
	powered := resp.Header.Get("X-Powered-By")
	if powered != "" {
		findings = append(findings, VulnFinding{
			ID:          nextID(),
			Severity:    "low",
			Category:    "info_disclosure",
			Title:       "X-Powered-By header reveals technology",
			Evidence:    "X-Powered-By: " + powered,
			Description: fmt.Sprintf("Technology disclosed: %s", powered),
			Remediation: "Remove the X-Powered-By header.",
		})
	}

	// X-AspNet-Version
	aspnet := resp.Header.Get("X-AspNet-Version")
	if aspnet != "" {
		findings = append(findings, VulnFinding{
			ID:       nextID(),
			Severity: "low",
			Category: "info_disclosure",
			Title:    "ASP.NET version disclosed",
			Evidence: "X-AspNet-Version: " + aspnet,
			Remediation: "Set <httpRuntime enableVersionHeader=\"false\" /> in web.config",
		})
	}

	// Check error pages for info leaks
	errURLs := []string{
		baseURL + "/this-path-does-not-exist-404-test",
		baseURL + "/%00",
		baseURL + "/'" ,
	}
	errorMarkers := []string{"stack trace", "Traceback", "Exception", "at System.", "at java.", "Fatal error", "Parse error", "Warning:", "Notice:", "Debug", "SQLSTATE", "MySQL", "PostgreSQL", "ORA-", "Microsoft OLE DB"}

	for _, u := range errURLs {
		if ctx.Err() != nil {
			break
		}
		_, errBody, err := doGet(ctx, client, u)
		if err != nil {
			continue
		}
		for _, marker := range errorMarkers {
			if strings.Contains(strings.ToLower(errBody), strings.ToLower(marker)) {
				findings = append(findings, VulnFinding{
					ID:          nextID(),
					Severity:    "medium",
					Category:    "info_disclosure",
					Title:       "Error page leaks technical information",
					Description: fmt.Sprintf("Error page contains '%s' which reveals internal technology details.", marker),
					URL:         u,
					Evidence:    truncate(errBody, 300),
					Remediation: "Configure custom error pages that don't expose internal details.",
				})
				break
			}
		}
	}

	// Check main page for HTML comments with sensitive info
	commentMarkers := []string{"TODO", "FIXME", "HACK", "password", "secret", "api_key", "token", "internal"}
	lowerBody := strings.ToLower(body)
	for _, marker := range commentMarkers {
		searchFrom := 0
		for searchFrom < len(lowerBody) {
			idx := strings.Index(lowerBody[searchFrom:], "<!--")
			if idx < 0 {
				break
			}
			idx += searchFrom
			end := strings.Index(lowerBody[idx:], "-->")
			if end < 0 {
				break
			}
			comment := body[idx : idx+end+3]
			if strings.Contains(strings.ToLower(comment), strings.ToLower(marker)) {
				findings = append(findings, VulnFinding{
					ID:          nextID(),
					Severity:    "low",
					Category:    "info_disclosure",
					Title:       fmt.Sprintf("HTML comment contains sensitive keyword: %s", marker),
					Evidence:    truncate(comment, 200),
					Remediation: "Remove sensitive HTML comments from production pages.",
				})
				break
			}
			searchFrom = idx + end + 3
		}
	}

	return findings
}

// ---------- Module 5: DNS Security ----------

func scanDNSSecurity(ctx context.Context, target string, nextID func() string) []VulnFinding {
	var findings []VulnFinding

	// Extract domain (strip subdomain for DMARC check)
	domain := target
	parts := strings.Split(target, ".")
	if len(parts) > 2 {
		domain = strings.Join(parts[len(parts)-2:], ".")
	}

	// SPF
	txts, err := net.LookupTXT(domain)
	hasSPF := false
	if err == nil {
		for _, txt := range txts {
			if strings.HasPrefix(txt, "v=spf1") {
				hasSPF = true
				if strings.Contains(txt, "+all") {
					findings = append(findings, VulnFinding{
						ID:       nextID(),
						Severity: "high",
						Category: "dns_security",
						Title:    "SPF record allows all senders (+all)",
						Evidence: txt,
						Description: "SPF policy allows any server to send emails for this domain.",
						Remediation: "Change +all to ~all or -all in the SPF record.",
					})
				}
			}
		}
	}
	if !hasSPF {
		findings = append(findings, VulnFinding{
			ID:          nextID(),
			Severity:    "medium",
			Category:    "dns_security",
			Title:       "No SPF record found",
			Description: "Without SPF, anyone can spoof emails from this domain.",
			Remediation: "Add a TXT record with a valid SPF policy.",
		})
	}

	// DMARC
	dmarcTxts, err := net.LookupTXT("_dmarc." + domain)
	hasDMARC := false
	if err == nil {
		for _, txt := range dmarcTxts {
			if strings.Contains(txt, "v=DMARC1") {
				hasDMARC = true
				if strings.Contains(txt, "p=none") {
					findings = append(findings, VulnFinding{
						ID:       nextID(),
						Severity: "low",
						Category: "dns_security",
						Title:    "DMARC policy set to none (monitoring only)",
						Evidence: txt,
						Description: "DMARC is present but doesn't enforce rejection of spoofed emails.",
						Remediation: "Set DMARC policy to p=quarantine or p=reject.",
					})
				}
			}
		}
	}
	if !hasDMARC {
		findings = append(findings, VulnFinding{
			ID:          nextID(),
			Severity:    "medium",
			Category:    "dns_security",
			Title:       "No DMARC record found",
			Description: "Without DMARC, email spoofing for this domain cannot be detected.",
			Remediation: "Add a _dmarc TXT record with at least p=quarantine.",
		})
	}

	// Zone transfer attempt
	nss, err := net.LookupNS(domain)
	if err == nil {
		for _, ns := range nss {
			conn, err := net.DialTimeout("tcp", ns.Host+":53", 5*time.Second)
			if err != nil {
				continue
			}
			// Send AXFR query (minimal)
			// This is a simple check — most servers will refuse
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			// Build minimal AXFR query
			qname := encodeDNSName(domain)
			// Transaction ID (2) + Flags (2) + Questions (2) + Answers (2) + Auth (2) + Additional (2) = 12 bytes header
			header := []byte{0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
			query := append(header, qname...)
			query = append(query, 0x00, 0xFC, 0x00, 0x01) // Type AXFR, Class IN
			// TCP DNS: prepend 2-byte length
			length := len(query)
			tcpMsg := append([]byte{byte(length >> 8), byte(length)}, query...)
			conn.Write(tcpMsg)
			buf := make([]byte, 1024)
			n, err := conn.Read(buf)
			conn.Close()
			if err != nil || n < 14 {
				continue
			}
			// Check if response has answers (non-zero answer count and no error)
			rcode := buf[5] & 0x0F // response code in byte 3 low nibble (after 2-byte TCP length)
			ancount := int(buf[8])<<8 | int(buf[9])
			if rcode == 0 && ancount > 0 {
				findings = append(findings, VulnFinding{
					ID:               nextID(),
					Severity:         "critical",
					Category:         "dns_security",
					Title:            fmt.Sprintf("DNS zone transfer allowed on %s", ns.Host),
					Description:      "Zone transfer (AXFR) is permitted, exposing all DNS records.",
					Remediation:      "Restrict zone transfers to authorized secondary nameservers.",
					ExploitAvailable: true,
					ExploitType:      "zone_transfer",
				})
			}
		}
	}

	return findings
}

func encodeDNSName(domain string) []byte {
	var buf []byte
	for _, label := range strings.Split(domain, ".") {
		buf = append(buf, byte(len(label)))
		buf = append(buf, []byte(label)...)
	}
	buf = append(buf, 0x00)
	return buf
}

// ---------- Module 6: HTTP Methods ----------

func scanHTTPMethods(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	dangerous := []string{"TRACE", "PUT", "DELETE", "CONNECT"}
	for _, method := range dangerous {
		req, err := http.NewRequestWithContext(ctx, method, baseURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NetScope/1.0)")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()

		if resp.StatusCode < 400 && resp.StatusCode != 301 && resp.StatusCode != 302 {
			sev := "medium"
			if method == "TRACE" {
				sev = "high" // XST attack
			}
			findings = append(findings, VulnFinding{
				ID:          nextID(),
				Severity:    sev,
				Category:    "http_methods",
				Title:       fmt.Sprintf("HTTP %s method enabled", method),
				Description: fmt.Sprintf("Server responded %d to %s request. This can be exploited for attacks.", resp.StatusCode, method),
				Evidence:    fmt.Sprintf("Status: %d %s", resp.StatusCode, resp.Status),
				Remediation: fmt.Sprintf("Disable %s method in web server configuration.", method),
			})
		}
	}

	// OPTIONS check
	req, err := http.NewRequestWithContext(ctx, "OPTIONS", baseURL, nil)
	if err == nil {
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NetScope/1.0)")
		resp, err := client.Do(req)
		if err == nil {
			allow := resp.Header.Get("Allow")
			resp.Body.Close()
			if allow != "" {
				findings = append(findings, VulnFinding{
					ID:       nextID(),
					Severity: "info",
					Category: "http_methods",
					Title:    "HTTP methods enumerated via OPTIONS",
					Evidence: "Allow: " + allow,
					Remediation: "Restrict OPTIONS responses to required methods only.",
				})
			}
		}
	}

	return findings
}

// ---------- Module 7: Directory Listing ----------

func scanDirListing(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	dirs := []string{"/", "/images/", "/img/", "/css/", "/js/", "/assets/", "/uploads/", "/static/", "/media/", "/files/", "/tmp/", "/logs/", "/data/"}
	markers := []string{"Index of /", "Directory listing", "[DIR]", "Parent Directory", "<title>Index of"}

	for _, dir := range dirs {
		_, body, err := doGet(ctx, client, baseURL+dir)
		if err != nil {
			continue
		}
		for _, marker := range markers {
			if strings.Contains(body, marker) {
				findings = append(findings, VulnFinding{
					ID:               nextID(),
					Severity:         "medium",
					Category:         "dir_listing",
					Title:            fmt.Sprintf("Directory listing enabled: %s", dir),
					Description:      "Directory listing allows attackers to discover files and internal structure.",
					URL:              baseURL + dir,
					Evidence:         truncate(body, 200),
					Remediation:      "Disable directory listing in web server configuration (Options -Indexes).",
					ExploitAvailable: true,
					ExploitType:      "dir_listing",
				})
				break
			}
		}
	}

	return findings
}

// ---------- Module 8: Open Redirect ----------

func scanOpenRedirect(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClientNoRedirect()

	params := []string{"url", "redirect", "redirect_url", "redirect_uri", "next", "return", "returnTo", "return_to", "go", "goto", "target", "link", "out", "continue", "dest", "destination", "redir", "redirect_to"}
	evilURL := "https://evil.example.com/pwned"

	for _, param := range params {
		testURL := fmt.Sprintf("%s/?%s=%s", baseURL, param, evilURL)
		req, err := http.NewRequestWithContext(ctx, "GET", testURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NetScope/1.0)")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			location := resp.Header.Get("Location")
			if strings.Contains(location, "evil.example.com") {
				findings = append(findings, VulnFinding{
					ID:               nextID(),
					Severity:         "medium",
					Category:         "open_redirect",
					Title:            fmt.Sprintf("Open redirect via '%s' parameter", param),
					Description:      "Server redirects to attacker-controlled URL. Can be used for phishing.",
					URL:              testURL,
					Evidence:         "Location: " + location,
					Remediation:      "Validate redirect URLs against a whitelist of allowed destinations.",
					ExploitAvailable: true,
					ExploitType:      "open_redirect",
				})
			}
		}
	}

	return findings
}

// ---------- Module 9: Subdomain Enumeration ----------

func scanSubdomains(ctx context.Context, target string, nextID func() string) []VulnFinding {
	var findings []VulnFinding

	domain := target
	parts := strings.Split(target, ".")
	if len(parts) > 2 {
		domain = strings.Join(parts[len(parts)-2:], ".")
	}

	subs := []string{
		"www", "mail", "ftp", "admin", "api", "dev", "staging", "test", "beta",
		"stage", "vpn", "remote", "portal", "blog", "shop", "store", "app",
		"dashboard", "panel", "cms", "cdn", "static", "assets", "img", "images",
		"media", "upload", "files", "docs", "doc", "help", "support", "status",
		"monitor", "grafana", "kibana", "jenkins", "gitlab", "git", "ci", "cd",
		"deploy", "build", "internal", "intranet", "corp", "private", "secure",
		"login", "auth", "sso", "oauth", "id", "accounts",
	}

	resolver := &net.Resolver{}
	foundSubs := []string{}
	for _, sub := range subs {
		if ctx.Err() != nil {
			break
		}
		fqdn := sub + "." + domain
		addrs, err := resolver.LookupHost(ctx, fqdn)
		if err != nil || len(addrs) == 0 {
			continue
		}
		foundSubs = append(foundSubs, fqdn+" → "+addrs[0])
	}

	if len(foundSubs) > 0 {
		// Report as single info finding with all subdomains
		findings = append(findings, VulnFinding{
			ID:          nextID(),
			Severity:    "info",
			Category:    "subdomains",
			Title:       fmt.Sprintf("%d subdomains discovered", len(foundSubs)),
			Description: "Active subdomains found via DNS enumeration. Check for unpatched or exposed services.",
			Evidence:    strings.Join(foundSubs, "\n"),
			Remediation: "Audit all subdomains for exposed services, default credentials, and outdated software.",
		})

		// Flag specific dangerous subdomains
		dangerousSubs := map[string]string{
			"jenkins": "CI/CD server — may allow code execution",
			"gitlab":  "Source code repository — may expose code",
			"kibana":  "Log aggregation — may expose sensitive data",
			"grafana": "Monitoring — may expose infrastructure details",
			"admin":   "Admin panel — may have weak authentication",
			"staging": "Staging environment — often less secured",
			"test":    "Test environment — often has debug enabled",
			"dev":     "Development environment — often has debug enabled",
			"internal": "Internal service exposed to the internet",
		}
		for _, sub := range subs {
			fqdn := sub + "." + domain
			if desc, isDangerous := dangerousSubs[sub]; isDangerous {
				// Check if this sub was actually found
				for _, found := range foundSubs {
					if strings.HasPrefix(found, fqdn) {
						findings = append(findings, VulnFinding{
							ID:               nextID(),
							Severity:         "medium",
							Category:         "subdomains",
							Title:            fmt.Sprintf("Sensitive subdomain exposed: %s", fqdn),
							Description:      desc,
							URL:              "https://" + fqdn,
							Remediation:      "Restrict access with authentication or firewall rules.",
							ExploitAvailable: true,
							ExploitType:      "subdomain_probe",
						})
						break
					}
				}
			}
		}
	}

	return findings
}

// ---------- Module 10: WAF Detection ----------

func scanWAF(ctx context.Context, baseURL string, target string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	// Send a request with an attack payload to trigger WAF
	testURL := baseURL + "/?id=1' OR '1'='1"
	resp, body, err := doGet(ctx, client, testURL)
	if err != nil || resp == nil {
		return findings
	}

	wafDetected := ""
	wafEvidence := ""

	// Check headers
	for _, h := range []string{"Server", "X-CDN", "X-Cache", "CF-RAY", "X-Sucuri-ID", "X-Akamai-Transformed", "X-Azure-Ref"} {
		val := resp.Header.Get(h)
		if val == "" {
			continue
		}
		switch {
		case h == "CF-RAY":
			wafDetected = "Cloudflare"
			wafEvidence = "CF-RAY: " + val
		case strings.Contains(strings.ToLower(val), "cloudflare"):
			wafDetected = "Cloudflare"
			wafEvidence = h + ": " + val
		case strings.Contains(strings.ToLower(val), "akamai"):
			wafDetected = "Akamai"
			wafEvidence = h + ": " + val
		case strings.Contains(strings.ToLower(val), "sucuri"):
			wafDetected = "Sucuri"
			wafEvidence = h + ": " + val
		case strings.Contains(strings.ToLower(val), "incapsula") || strings.Contains(strings.ToLower(val), "imperva"):
			wafDetected = "Imperva/Incapsula"
			wafEvidence = h + ": " + val
		case h == "X-Azure-Ref":
			wafDetected = "Azure Front Door"
			wafEvidence = h + ": " + val
		}
	}

	// Check body for WAF block pages
	if wafDetected == "" {
		wafSignatures := map[string]string{
			"cloudflare":           "Cloudflare",
			"attention required":   "Cloudflare",
			"sucuri":               "Sucuri",
			"access denied":        "Generic WAF",
			"mod_security":         "ModSecurity",
			"modsecurity":          "ModSecurity",
			"web application firewall": "Generic WAF",
			"blocked by":           "Generic WAF",
			"request blocked":      "Generic WAF",
		}
		bodyLower := strings.ToLower(body)
		for sig, name := range wafSignatures {
			if strings.Contains(bodyLower, sig) {
				wafDetected = name
				wafEvidence = fmt.Sprintf("Body contains '%s'", sig)
				break
			}
		}
	}

	if wafDetected != "" {
		findings = append(findings, VulnFinding{
			ID:       nextID(),
			Severity: "info",
			Category: "waf",
			Title:    fmt.Sprintf("WAF detected: %s", wafDetected),
			Evidence: wafEvidence,
			Description: fmt.Sprintf("A Web Application Firewall (%s) is protecting this target. Attacks may be filtered.", wafDetected),
		})
	} else {
		findings = append(findings, VulnFinding{
			ID:          nextID(),
			Severity:    "low",
			Category:    "waf",
			Title:       "No WAF detected",
			Description: "No Web Application Firewall was detected. The application may be directly exposed to attacks.",
			Remediation: "Consider deploying a WAF (Cloudflare, AWS WAF, ModSecurity) for additional protection.",
		})
	}

	return findings
}

// ---------- Module 11: Banner Grabbing ----------

func scanBannerGrab(ctx context.Context, target string, nextID func() string) []VulnFinding {
	var findings []VulnFinding

	ports := []struct {
		port    int
		service string
	}{
		{21, "FTP"}, {22, "SSH"}, {25, "SMTP"}, {80, "HTTP"}, {110, "POP3"},
		{143, "IMAP"}, {443, "HTTPS"}, {587, "SMTP"}, {993, "IMAPS"},
		{995, "POP3S"}, {3306, "MySQL"}, {5432, "PostgreSQL"}, {8080, "HTTP-Alt"},
		{8443, "HTTPS-Alt"},
	}

	knownVulnVersions := map[string]struct {
		sev  string
		desc string
	}{
		"OpenSSH_7.":  {"medium", "OpenSSH 7.x has known vulnerabilities. Upgrade to 9.x+."},
		"OpenSSH_6.":  {"high", "OpenSSH 6.x is severely outdated with critical vulnerabilities."},
		"Apache/2.2":  {"high", "Apache 2.2 is end-of-life. Multiple known CVEs."},
		"Apache/2.4.4": {"medium", "Apache 2.4.49-2.4.50 path traversal (CVE-2021-41773)."},
		"nginx/1.1":   {"high", "nginx 1.1x is severely outdated."},
		"nginx/1.0":   {"high", "nginx 1.0x is severely outdated."},
		"ProFTPD 1.3.5": {"high", "ProFTPD 1.3.5 has remote code execution vulnerabilities."},
		"vsftpd 2.":   {"high", "vsftpd 2.x has known backdoor vulnerability."},
		"MySQL 5.5":   {"medium", "MySQL 5.5 is end-of-life."},
		"MySQL 5.6":   {"medium", "MySQL 5.6 is end-of-life."},
		"PostgreSQL 9.": {"medium", "PostgreSQL 9.x is end-of-life."},
	}

	dialer := &net.Dialer{Timeout: 2 * time.Second}
	for _, p := range ports {
		if ctx.Err() != nil {
			break
		}
		addr := fmt.Sprintf("%s:%d", target, p.port)
		conn, err := dialer.DialContext(ctx, "tcp", addr)
		if err != nil {
			continue
		}
		conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		buf := make([]byte, 1024)
		n, _ := conn.Read(buf)
		conn.Close()

		banner := strings.TrimSpace(string(buf[:n]))
		if banner == "" {
			continue
		}

		sev := "info"
		desc := fmt.Sprintf("Service banner on port %d (%s): %s", p.port, p.service, banner)
		remediation := "Hide or minimize service banners in production."
		exploitAvail := false

		// Check for known vulnerable versions
		for pattern, vuln := range knownVulnVersions {
			if strings.Contains(banner, pattern) {
				sev = vuln.sev
				desc = vuln.desc + " Banner: " + banner
				remediation = "Upgrade to the latest stable version of this software."
				exploitAvail = true
				break
			}
		}

		findings = append(findings, VulnFinding{
			ID:               nextID(),
			Severity:         sev,
			Category:         "banner",
			Title:            fmt.Sprintf("Service banner: %s on port %d", p.service, p.port),
			Description:      desc,
			Evidence:         truncate(banner, 200),
			Remediation:      remediation,
			ExploitAvailable: exploitAvail,
			ExploitType:      "version_exploit",
		})
	}

	return findings
}

// ---------- Module 12: SQLi Probing ----------

func scanSQLi(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	// Test common injection points
	payloads := []struct {
		suffix  string
		errSigs []string
	}{
		{"'", []string{"SQL syntax", "mysql_", "pg_query", "SQLite3::", "ORA-", "SQLSTATE", "unclosed quotation", "syntax error", "Microsoft SQL"}},
		{"' OR '1'='1", []string{"SQL syntax", "mysql_", "ORA-", "SQLSTATE"}},
		{"1 AND 1=1", nil}, // used with time-based
		{"'; WAITFOR DELAY '0:0:5'--", nil},
		{"' AND SLEEP(3)--", nil},
	}

	// Common parameter names to test
	paths := []string{
		"/?id=1",
		"/?page=1",
		"/?cat=1",
		"/?user=1",
		"/?item=1",
		"/?product=1",
		"/?search=test",
		"/search?q=test",
		"/login",
	}

	for _, path := range paths {
		for _, payload := range payloads {
			testURL := baseURL + path + payload.suffix
			if strings.Contains(path, "=") {
				// Append payload to the parameter value
				testURL = baseURL + path + payload.suffix
			}

			start := time.Now()
			_, body, err := doGet(ctx, client, testURL)
			elapsed := time.Since(start)
			if err != nil {
				continue
			}

			// Error-based detection
			if len(payload.errSigs) > 0 {
				bodyLower := strings.ToLower(body)
				for _, sig := range payload.errSigs {
					if strings.Contains(bodyLower, strings.ToLower(sig)) {
						findings = append(findings, VulnFinding{
							ID:               nextID(),
							Severity:         "critical",
							Category:         "sqli",
							Title:            fmt.Sprintf("SQL Injection (error-based) on %s", path),
							Description:      fmt.Sprintf("SQL error detected in response when injecting '%s'", payload.suffix),
							URL:              testURL,
							Evidence:         fmt.Sprintf("Error signature: %s", sig),
							Remediation:      "Use parameterized queries / prepared statements. Never concatenate user input into SQL.",
							ExploitAvailable: true,
							ExploitType:      "sqli",
						})
						goto nextPath // one finding per path is enough
					}
				}
			}

			// Time-based detection (if SLEEP payload and response took > 4s)
			if strings.Contains(payload.suffix, "SLEEP") || strings.Contains(payload.suffix, "WAITFOR") {
				if elapsed > 4*time.Second {
					findings = append(findings, VulnFinding{
						ID:               nextID(),
						Severity:         "critical",
						Category:         "sqli",
						Title:            fmt.Sprintf("SQL Injection (time-based) on %s", path),
						Description:      fmt.Sprintf("Response delayed by %v after injecting time-based payload", elapsed.Round(time.Millisecond)),
						URL:              testURL,
						Evidence:         fmt.Sprintf("Delay: %v (expected >4s)", elapsed.Round(time.Millisecond)),
						Remediation:      "Use parameterized queries / prepared statements.",
						ExploitAvailable: true,
						ExploitType:      "sqli",
					})
					goto nextPath
				}
			}
		}
	nextPath:
	}

	return findings
}

// ---------- Module 13: XSS Probing ----------

func scanXSS(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	// XSS probe payloads — we check if the payload is reflected unescaped
	canary := "n3tsc0p3xss"
	payloads := []struct {
		input    string
		checkFor string
		xssType  string
	}{
		{`<script>alert('` + canary + `')</script>`, `<script>alert('` + canary + `')`, "Reflected XSS (script tag)"},
		{`"><img src=x onerror=alert('` + canary + `')>`, `onerror=alert('` + canary + `')`, "Reflected XSS (event handler)"},
		{`'><svg/onload=alert('` + canary + `')>`, `onload=alert('` + canary + `')`, "Reflected XSS (SVG onload)"},
		{canary + `"onmouseover="alert(1)`, canary + `"onmouseover="alert(1)`, "Reflected XSS (attribute injection)"},
	}

	params := []string{"q", "search", "query", "s", "keyword", "id", "name", "user", "page", "redirect", "url", "msg", "message", "error", "text", "input", "value", "data", "content"}
	paths := []string{"/", "/search", "/login", "/register", "/contact", "/feedback"}

	for _, path := range paths {
		for _, param := range params {
			for _, payload := range payloads {
				testURL := fmt.Sprintf("%s%s?%s=%s", baseURL, path, param, payload.input)
				_, body, err := doGet(ctx, client, testURL)
				if err != nil {
					continue
				}

				if strings.Contains(body, payload.checkFor) {
					findings = append(findings, VulnFinding{
						ID:               nextID(),
						Severity:         "high",
						Category:         "xss",
						Title:            fmt.Sprintf("%s via '%s' param on %s", payload.xssType, param, path),
						Description:      "User input is reflected in the response without proper encoding.",
						URL:              testURL,
						Evidence:         fmt.Sprintf("Payload reflected: %s", truncate(payload.checkFor, 100)),
						Remediation:      "Encode all user input before rendering in HTML. Use Content-Security-Policy headers.",
						ExploitAvailable: true,
						ExploitType:      "xss",
					})
					goto nextXSSPath // one finding per path+param combo
				}
			}
		}
	nextXSSPath:
	}

	return findings
}

// ---------- Module 14: SSRF Detection ----------

func scanSSRF(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	ssrfPayloads := []string{
		"http://127.0.0.1",
		"http://localhost",
		"http://169.254.169.254/latest/meta-data/", // AWS metadata
		"http://[::1]",
		"http://0x7f000001",
	}

	urlParams := []string{"url", "link", "src", "source", "image", "img", "uri", "path", "dest", "redirect", "fetch", "proxy", "page", "load", "request"}

	for _, param := range urlParams {
		for _, payload := range ssrfPayloads {
			testURL := fmt.Sprintf("%s/?%s=%s", baseURL, param, payload)
			resp, body, err := doGet(ctx, client, testURL)
			if err != nil || resp == nil {
				continue
			}

			// Check for SSRF indicators in response
			ssrfIndicators := []string{
				"ami-id", "instance-id", "local-hostname", // AWS metadata
				"root:x:0:0", // /etc/passwd
				"127.0.0.1", "localhost",
			}

			for _, indicator := range ssrfIndicators {
				if strings.Contains(body, indicator) && resp.StatusCode == 200 {
					sev := "critical"
					if payload == "http://169.254.169.254/latest/meta-data/" {
						sev = "critical"
					}
					findings = append(findings, VulnFinding{
						ID:               nextID(),
						Severity:         sev,
						Category:         "ssrf",
						Title:            fmt.Sprintf("SSRF via '%s' parameter", param),
						Description:      fmt.Sprintf("Server fetched internal resource: %s", payload),
						URL:              testURL,
						Evidence:         truncate(body, 200),
						Remediation:      "Validate and whitelist URLs. Block internal/private IP ranges. Don't follow redirects to internal hosts.",
						ExploitAvailable: true,
						ExploitType:      "ssrf",
					})
					goto nextSSRFParam
				}
			}
		}
	nextSSRFParam:
	}

	return findings
}

// ---------- Module 15: API Discovery ----------

func scanAPIDiscovery(ctx context.Context, baseURL string, nextID func() string) []VulnFinding {
	var findings []VulnFinding
	client := vulnHTTPClient()

	endpoints := []struct {
		path    string
		desc    string
		markers []string
		sev     string
	}{
		{"/api", "API root endpoint", []string{"{", "api", "version"}, "info"},
		{"/api/v1", "API v1 endpoint", []string{"{", "api"}, "info"},
		{"/api/v2", "API v2 endpoint", []string{"{", "api"}, "info"},
		{"/graphql", "GraphQL endpoint", []string{"query", "mutation", "schema", "GraphQL"}, "medium"},
		{"/graphql?query={__schema{types{name}}}", "GraphQL introspection", []string{"__schema", "types", "queryType"}, "high"},
		{"/swagger", "Swagger UI", []string{"swagger", "api-docs"}, "info"},
		{"/swagger.json", "Swagger spec", []string{"swagger", "paths", "definitions"}, "low"},
		{"/swagger/v1/swagger.json", "Swagger spec v1", []string{"swagger", "paths"}, "low"},
		{"/openapi.json", "OpenAPI spec", []string{"openapi", "paths"}, "low"},
		{"/api-docs", "API documentation", []string{"swagger", "api", "docs"}, "info"},
		{"/docs", "Documentation endpoint", []string{"doc", "api"}, "info"},
		{"/redoc", "ReDoc API docs", []string{"redoc", "api"}, "info"},
		{"/.well-known/openid-configuration", "OpenID configuration", []string{"issuer", "authorization_endpoint"}, "info"},
		{"/actuator", "Spring Boot Actuator", []string{"health", "info", "beans", "env"}, "high"},
		{"/actuator/env", "Spring Boot env (secrets!)", []string{"activeProfiles", "propertySources", "systemProperties"}, "critical"},
		{"/actuator/health", "Spring Boot health", []string{"status", "UP", "DOWN"}, "info"},
		{"/debug/pprof/", "Go pprof debug endpoint", []string{"Profile Descriptions", "goroutine", "heap"}, "high"},
		{"/debug/vars", "Go expvar endpoint", []string{"cmdline", "memstats"}, "medium"},
		{"/_debug", "Debug endpoint", []string{"debug", "trace"}, "medium"},
		{"/metrics", "Prometheus metrics", []string{"# HELP", "# TYPE", "process_"}, "medium"},
		{"/health", "Health check", []string{"status", "ok", "healthy"}, "info"},
		{"/healthz", "Kubernetes health", []string{"ok", "healthy"}, "info"},
		{"/info", "Info endpoint", []string{"version", "build", "app"}, "info"},
		{"/env", "Environment endpoint", []string{"env", "PATH", "HOME"}, "high"},
		{"/console", "Debug console", []string{"console", "debugger", "werkzeug"}, "critical"},
		{"/elmah.axd", "ELMAH error logs", []string{"Error Log for", "ELMAH"}, "high"},
		{"/__debug__/", "Django debug", []string{"Django", "debug"}, "high"},
	}

	for _, ep := range endpoints {
		resp, body, err := doGet(ctx, client, baseURL+ep.path)
		if err != nil || resp == nil {
			continue
		}
		if resp.StatusCode != 200 {
			continue
		}
		if len(ep.markers) > 0 {
			found := false
			bodyLower := strings.ToLower(body)
			for _, m := range ep.markers {
				if strings.Contains(bodyLower, strings.ToLower(m)) {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		f := VulnFinding{
			ID:          nextID(),
			Severity:    ep.sev,
			Category:    "api_discovery",
			Title:       fmt.Sprintf("Endpoint discovered: %s", ep.path),
			Description: ep.desc,
			URL:         baseURL + ep.path,
			Evidence:    truncate(body, 200),
			Remediation: "Restrict access to API endpoints. Remove debug/documentation endpoints in production.",
		}
		if ep.sev == "critical" || ep.sev == "high" {
			f.ExploitAvailable = true
			f.ExploitType = "api_exploit"
		}
		findings = append(findings, f)
	}

	return findings
}

func scanWithNuclei(ctx context.Context, baseURL, target, nucleiDir string, nextID func() string) []VulnFinding {
	var findings []VulnFinding

	products := []string{"apache", "nginx", "php", "wordpress", "tomcat", "jenkins", "iis", "joomla", "drupal"}

	for _, product := range products {
		if ctx.Err() != nil {
			break
		}
		templates, err := secrepos.FindTemplatesByProduct(nucleiDir, product)
		if err != nil || len(templates) == 0 {
			continue
		}

		limit := 10
		if len(templates) < limit {
			limit = len(templates)
		}

		for _, tmpl := range templates[:limit] {
			if ctx.Err() != nil {
				break
			}
			result, err := secrepos.ExecuteTemplate(ctx, tmpl, baseURL)
			if err != nil || !result.Matched {
				continue
			}
			findings = append(findings, VulnFinding{
				ID:               nextID(),
				Severity:         result.Severity,
				Category:         "nuclei",
				Title:            fmt.Sprintf("[%s] %s", result.TemplateID, result.Name),
				Description:      result.Description,
				URL:              result.MatchedURL,
				Evidence:         result.Evidence,
				ExploitAvailable: true,
				ExploitType:      "nuclei_template",
			})
		}
	}

	return findings
}

// ---------- Helpers ----------

func truncate(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
