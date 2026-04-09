package tools

import (
	"testing"
)

func TestValidateTarget(t *testing.T) {
	tests := []struct {
		name    string
		target  string
		wantErr bool
	}{
		// Valid cases
		{name: "valid IPv4", target: "8.8.8.8", wantErr: false},
		{name: "valid IPv4 loopback", target: "127.0.0.1", wantErr: false},
		{name: "valid IPv6", target: "2001:db8::1", wantErr: false},
		{name: "valid IPv6 full", target: "::1", wantErr: false},
		{name: "valid CIDR", target: "192.168.1.0/24", wantErr: false},
		{name: "valid CIDR /32", target: "10.0.0.1/32", wantErr: false},
		{name: "valid domain", target: "example.com", wantErr: false},
		{name: "valid subdomain", target: "sub.example.com", wantErr: false},
		{name: "valid long domain", target: "www.google.com", wantErr: false},
		{name: "valid domain with hyphens", target: "my-host.example.com", wantErr: false},

		// Invalid cases - shell injection
		{name: "semicolon injection", target: "; rm -rf /", wantErr: true},
		{name: "command substitution", target: "$(whoami)", wantErr: true},
		{name: "ip with semicolon", target: "8.8.8.8; ls", wantErr: true},
		{name: "pipe injection", target: "8.8.8.8 | cat /etc/passwd", wantErr: true},
		{name: "ampersand injection", target: "8.8.8.8 && id", wantErr: true},
		{name: "backtick injection", target: "`id`", wantErr: true},
		{name: "dollar variable", target: "$HOME", wantErr: true},
		{name: "redirect injection", target: "host > /tmp/out", wantErr: true},
		{name: "space in target", target: "8.8.8.8 8.8.4.4", wantErr: true},

		// Invalid cases - structural
		{name: "empty target", target: "", wantErr: true},
		{name: "starts with dash", target: "-oops", wantErr: true},
		{name: "invalid domain no tld", target: "localhost", wantErr: true},
		{name: "random string", target: "not-a-valid-target!!!", wantErr: true},
		{name: "exclamation mark", target: "host!name.com", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateTarget(tt.target)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTarget(%q) error = %v, wantErr %v", tt.target, err, tt.wantErr)
			}
		})
	}
}

func TestValidateScanType(t *testing.T) {
	validTypes := []string{
		"ping", "traceroute", "mtr", "dns", "whois", "portscan", "vulnscan", "ssl", "headers",
	}
	for _, st := range validTypes {
		t.Run("valid_"+st, func(t *testing.T) {
			if err := ValidateScanType(st); err != nil {
				t.Errorf("ValidateScanType(%q) unexpected error: %v", st, err)
			}
		})
	}

	invalidTypes := []string{
		"", "nmap", "exploit", "unknown", "PING", "Ping", "scan", "tcp", "udp",
	}
	for _, st := range invalidTypes {
		t.Run("invalid_"+st, func(t *testing.T) {
			if err := ValidateScanType(st); err == nil {
				t.Errorf("ValidateScanType(%q) expected error, got nil", st)
			}
		})
	}
}
