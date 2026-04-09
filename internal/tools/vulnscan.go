package tools

import (
	"context"
	"fmt"
)

// VulnFinding represents a single vulnerability finding.
type VulnFinding struct {
	Severity    string `json:"severity"` // critical, high, medium, low, info
	Category    string `json:"category"` // ssl, headers, ports, service
	Title       string `json:"title"`
	Description string `json:"description"`
	Remediation string `json:"remediation,omitempty"`
}

// VulnScanResult holds the combined vulnerability scan results.
type VulnScanResult struct {
	Target   string        `json:"target"`
	Grade    string        `json:"grade"`
	Summary  VulnSummary   `json:"summary"`
	SSL      *SSLResult    `json:"ssl,omitempty"`
	Headers  *HeadersResult `json:"headers,omitempty"`
	Ports    *PortScanResult `json:"ports,omitempty"`
	Findings []VulnFinding `json:"findings"`
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

// VulnScan runs a composite vulnerability scan: ports + SSL + headers.
func VulnScan(ctx context.Context, target string) (*VulnScanResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, err
	}

	cleanTarget := StripURLScheme(target)
	result := &VulnScanResult{
		Target:   cleanTarget,
		Findings: []VulnFinding{},
	}

	// 1. Port scan (quick)
	ports, err := PortScan(ctx, cleanTarget, "quick", true)
	if err == nil && ports != nil {
		result.Ports = ports
		// Flag dangerous open ports
		dangerousPorts := map[int]string{
			21: "FTP", 23: "Telnet", 25: "SMTP", 135: "MSRPC", 139: "NetBIOS",
			445: "SMB", 1433: "MSSQL", 1521: "Oracle", 3306: "MySQL",
			3389: "RDP", 5432: "PostgreSQL", 5900: "VNC", 6379: "Redis",
			27017: "MongoDB", 9200: "Elasticsearch",
		}
		for _, p := range ports.Ports {
			if p.State != "open" {
				continue
			}
			if svc, dangerous := dangerousPorts[p.Port]; dangerous {
				result.Findings = append(result.Findings, VulnFinding{
					Severity:    "high",
					Category:    "ports",
					Title:       fmt.Sprintf("Dangerous port open: %d/%s (%s)", p.Port, p.Protocol, svc),
					Description: fmt.Sprintf("Port %d (%s) is open and accessible. This service is commonly targeted by attackers.", p.Port, svc),
					Remediation: "Restrict access with firewall rules or disable the service if not needed.",
				})
			}
		}
	}

	// 2. SSL/TLS audit
	ssl, err := SSLAudit(ctx, cleanTarget)
	if err == nil && ssl != nil {
		result.SSL = ssl
		for _, issue := range ssl.Issues {
			sev := "medium"
			if contains(issue, "expired") || contains(issue, "verification failed") {
				sev = "critical"
			} else if contains(issue, "SSLv3") || contains(issue, "TLS 1.0") {
				sev = "high"
			}
			result.Findings = append(result.Findings, VulnFinding{
				Severity:    sev,
				Category:    "ssl",
				Title:       issue,
				Description: "SSL/TLS configuration issue detected.",
				Remediation: "Update TLS configuration to disable insecure protocols and ciphers.",
			})
		}
		if len(ssl.Certificates) > 0 && ssl.Certificates[0].DaysLeft <= 30 {
			sev := "medium"
			if ssl.Certificates[0].DaysLeft <= 7 {
				sev = "high"
			}
			if ssl.Certificates[0].IsExpired {
				sev = "critical"
			}
			result.Findings = append(result.Findings, VulnFinding{
				Severity:    sev,
				Category:    "ssl",
				Title:       fmt.Sprintf("Certificate expires in %d days", ssl.Certificates[0].DaysLeft),
				Description: fmt.Sprintf("Certificate for %s expires on %s", ssl.Certificates[0].Subject, ssl.Certificates[0].NotAfter.Format("2006-01-02")),
				Remediation: "Renew the SSL certificate before expiration.",
			})
		}
	}

	// 3. HTTP headers
	headers, err := CheckHTTPHeaders(ctx, "https://"+cleanTarget)
	if err == nil && headers != nil {
		result.Headers = headers
		for _, h := range headers.Headers {
			if !h.Present && h.Rating == "fail" {
				result.Findings = append(result.Findings, VulnFinding{
					Severity:    "medium",
					Category:    "headers",
					Title:       fmt.Sprintf("Missing security header: %s", h.Name),
					Description: h.Note,
					Remediation: fmt.Sprintf("Add the %s header to your HTTP responses.", h.Name),
				})
			}
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
	if result.Summary.Critical > 0 {
		result.Grade = "F"
	} else if result.Summary.High > 0 {
		result.Grade = "D"
	} else if result.Summary.Medium > 2 {
		result.Grade = "C"
	} else if result.Summary.Medium > 0 {
		result.Grade = "B"
	} else {
		result.Grade = "A"
	}

	return result, nil
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsLower(s, sub))
}

func containsLower(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
