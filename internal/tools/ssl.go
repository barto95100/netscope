package tools

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"math"
	"net"
	"strings"
	"time"
)

// SSLCertInfo holds information about a single TLS certificate.
type SSLCertInfo struct {
	Subject   string    `json:"subject"`
	Issuer    string    `json:"issuer"`
	NotBefore time.Time `json:"not_before"`
	NotAfter  time.Time `json:"not_after"`
	DNSNames  []string  `json:"dns_names"`
	IsExpired bool      `json:"is_expired"`
	DaysLeft  int       `json:"days_left"`
	Serial    string    `json:"serial"`
	SigAlgo   string    `json:"sig_algo"`
}

// SSLResult holds the TLS audit results for a target.
type SSLResult struct {
	Target       string        `json:"target"`
	Grade        string        `json:"grade"`
	Protocol     string        `json:"protocol"`
	CipherSuite  string        `json:"cipher_suite"`
	Certificates []SSLCertInfo `json:"certificates"`
	Protocols    []string      `json:"protocols"`
	Issues       []string      `json:"issues"`
}

// SSLAudit connects to the target host over TLS and audits the configuration.
func SSLAudit(ctx context.Context, target string) (*SSLResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	// Strip URL scheme
	host := StripURLScheme(target)
	port := "443"
	if h, p, err := net.SplitHostPort(target); err == nil {
		host = h
		port = p
	}

	addr := net.JoinHostPort(host, port)

	result := &SSLResult{
		Target:       target,
		Certificates: []SSLCertInfo{},
		Protocols:    []string{},
		Issues:       []string{},
	}

	// Probe which TLS versions are supported
	type versionInfo struct {
		name    string
		version uint16
		legacy  bool
	}
	versions := []versionInfo{
		{"TLS 1.3", tls.VersionTLS13, false},
		{"TLS 1.2", tls.VersionTLS12, false},
		{"TLS 1.1", tls.VersionTLS11, true},
		{"TLS 1.0", tls.VersionTLS10, true},
	}

	var primaryConn *tls.Conn
	var primaryState tls.ConnectionState

	dialer := &net.Dialer{Timeout: 10 * time.Second}

	for _, v := range versions {
		cfg := &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: true, //nolint:gosec // intentional for audit
			MinVersion:         v.version,
			MaxVersion:         v.version,
		}
		netConn, err := dialer.DialContext(ctx, "tcp", addr)
		if err != nil {
			break // host not reachable
		}
		tlsConn := tls.Client(netConn, cfg)
		tlsConn.SetDeadline(time.Now().Add(10 * time.Second)) //nolint:errcheck
		if err := tlsConn.Handshake(); err == nil {
			state := tlsConn.ConnectionState()
			result.Protocols = append(result.Protocols, v.name)
			if v.legacy {
				result.Issues = append(result.Issues, fmt.Sprintf("deprecated protocol supported: %s", v.name))
			}
			if primaryConn == nil {
				primaryConn = tlsConn
				primaryState = state
			} else {
				tlsConn.Close()
			}
		} else {
			netConn.Close()
		}
	}

	if primaryConn == nil {
		return nil, fmt.Errorf("could not establish TLS connection to %s", addr)
	}
	defer primaryConn.Close()

	// Map protocol version
	switch primaryState.Version {
	case tls.VersionTLS13:
		result.Protocol = "TLS 1.3"
	case tls.VersionTLS12:
		result.Protocol = "TLS 1.2"
	case tls.VersionTLS11:
		result.Protocol = "TLS 1.1"
	case tls.VersionTLS10:
		result.Protocol = "TLS 1.0"
	default:
		result.Protocol = "Unknown"
	}

	result.CipherSuite = tls.CipherSuiteName(primaryState.CipherSuite)

	// Collect certificate info
	now := time.Now()
	for _, cert := range primaryState.PeerCertificates {
		daysLeft := int(math.Floor(cert.NotAfter.Sub(now).Hours() / 24))
		info := SSLCertInfo{
			Subject:   cert.Subject.String(),
			Issuer:    cert.Issuer.String(),
			NotBefore: cert.NotBefore,
			NotAfter:  cert.NotAfter,
			DNSNames:  cert.DNSNames,
			IsExpired: now.After(cert.NotAfter),
			DaysLeft:  daysLeft,
			Serial:    cert.SerialNumber.String(),
			SigAlgo:   cert.SignatureAlgorithm.String(),
		}
		result.Certificates = append(result.Certificates, info)

		if info.IsExpired {
			result.Issues = append(result.Issues, "certificate is expired")
		} else if daysLeft < 30 {
			result.Issues = append(result.Issues, fmt.Sprintf("certificate expires soon: %d days", daysLeft))
		}
	}

	// Grade calculation
	result.Grade = computeSSLGrade(result)

	return result, nil
}

func computeSSLGrade(r *SSLResult) string {
	score := 100

	// Penalise legacy protocols
	for _, issue := range r.Issues {
		if strings.HasPrefix(issue, "deprecated protocol") {
			score -= 20
		}
		if strings.HasPrefix(issue, "certificate is expired") {
			score -= 40
		}
		if strings.HasPrefix(issue, "certificate expires soon") {
			score -= 10
		}
	}

	// Penalise weak protocol in use
	switch r.Protocol {
	case "TLS 1.0":
		score -= 30
	case "TLS 1.1":
		score -= 20
	}

	switch {
	case score >= 90:
		return "A"
	case score >= 80:
		return "B"
	case score >= 70:
		return "C"
	case score >= 60:
		return "D"
	default:
		return "F"
	}
}

// certSubjectName formats an x509 name into a human-readable string.
func certSubjectName(cert *x509.Certificate) string {
	return cert.Subject.CommonName
}
