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
	"vulnscan":   true,
	"ssl":        true,
	"headers":    true,
}

// ValidateTarget validates a network target (IP, CIDR, or domain name).
func ValidateTarget(target string) error {
	if target == "" {
		return errors.New("target must not be empty")
	}

	if strings.HasPrefix(target, "-") {
		return errors.New("target must not start with a dash")
	}

	if strings.ContainsAny(target, dangerousChars) {
		return errors.New("target contains invalid characters")
	}

	// Accept valid IP address (IPv4 or IPv6)
	if net.ParseIP(target) != nil {
		return nil
	}

	// Accept valid CIDR notation
	if _, _, err := net.ParseCIDR(target); err == nil {
		return nil
	}

	// Accept valid domain name
	if domainRegex.MatchString(target) {
		return nil
	}

	return errors.New("target must be a valid IP address, CIDR range, or domain name")
}

// ValidateScanType validates the scan type against a whitelist of allowed values.
func ValidateScanType(scanType string) error {
	if !validScanTypes[scanType] {
		return errors.New("invalid scan type: " + scanType)
	}
	return nil
}
