package tools

import (
	"errors"
	"net"
	"regexp"
	"strings"
)

// dangerousChars contains characters that could enable shell injection.
const dangerousChars = ";|&$`(){}[]<>!\"' \t\n\r"

var domainRegex = regexp.MustCompile(`^([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`)

var validScanTypes = map[string]bool{
	"ping":       true,
	"traceroute": true,
	"mtr":        true,
	"dns":        true,
	"whois":      true,
	"portscan":   true,
	"vulnscan":     true,
	"vulnexploit": true,
	"pentest":     true,
	"ssl":         true,
	"headers":     true,
	"maclookup":   true,
}

// StripURLScheme removes http:// or https:// prefix and any trailing path from a target.
func StripURLScheme(target string) string {
	t := target
	t = strings.TrimPrefix(t, "https://")
	t = strings.TrimPrefix(t, "http://")
	// Remove path/query if present
	if idx := strings.IndexAny(t, "/?#"); idx != -1 {
		t = t[:idx]
	}
	return t
}

// ValidateTarget validates a network target (IP, CIDR, or domain name).
// Accepts URLs (http/https) by stripping the scheme first.
func ValidateTarget(target string) error {
	if target == "" {
		return errors.New("target must not be empty")
	}

	// Strip URL scheme for tools that accept domains
	cleaned := StripURLScheme(target)

	if strings.HasPrefix(cleaned, "-") {
		return errors.New("target must not start with a dash")
	}

	if strings.ContainsAny(cleaned, dangerousChars) {
		return errors.New("target contains invalid characters")
	}

	// Accept valid IP address (IPv4 or IPv6)
	if net.ParseIP(cleaned) != nil {
		return nil
	}

	// Accept valid CIDR notation
	if _, _, err := net.ParseCIDR(cleaned); err == nil {
		return nil
	}

	// Accept host:port (for TCP monitors)
	if host, _, err := net.SplitHostPort(cleaned); err == nil {
		if net.ParseIP(host) != nil || domainRegex.MatchString(host) {
			return nil
		}
	}

	// Accept valid domain name
	if domainRegex.MatchString(cleaned) {
		return nil
	}

	return errors.New("target must be a valid IP address, CIDR range, URL, or domain name")
}

// ValidateScanType validates the scan type against a whitelist of allowed values.
func ValidateScanType(scanType string) error {
	if !validScanTypes[scanType] {
		return errors.New("invalid scan type: " + scanType)
	}
	return nil
}
