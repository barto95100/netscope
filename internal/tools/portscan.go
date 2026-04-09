package tools

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// PortResult holds information about a single scanned port.
type PortResult struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	State    string `json:"state"`
	Service  string `json:"service"`
	Version  string `json:"version,omitempty"`
}

// PortScanResult holds the results of a port scan.
type PortScanResult struct {
	Target  string       `json:"target"`
	Profile string       `json:"profile"`
	Ports   []PortResult `json:"ports"`
	ScanMs  float64      `json:"scan_ms"`
}

// nmapXML is used to unmarshal nmap XML output.
type nmapXML struct {
	XMLName xml.Name   `xml:"nmaprun"`
	Hosts   []nmapHost `xml:"host"`
}

type nmapHost struct {
	Ports nmapPorts `xml:"ports"`
}

type nmapPorts struct {
	Ports []nmapPort `xml:"port"`
}

type nmapPort struct {
	Protocol string      `xml:"protocol,attr"`
	PortID   int         `xml:"portid,attr"`
	State    nmapState   `xml:"state"`
	Service  nmapService `xml:"service"`
}

type nmapState struct {
	State string `xml:"state,attr"`
}

type nmapService struct {
	Name    string `xml:"name,attr"`
	Product string `xml:"product,attr"`
	Version string `xml:"version,attr"`
}

// PortScan runs an nmap port scan against the target using the given profile.
// profiles: quick (top 100), standard (top 1000), full (all ports)
func PortScan(ctx context.Context, target, profile string, detectServices bool) (*PortScanResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	args := []string{"-oX", "-", "--noninteractive"}

	switch strings.ToLower(profile) {
	case "quick":
		args = append(args, "--top-ports", "100")
	case "full":
		args = append(args, "-p-")
	default: // standard
		args = append(args, "--top-ports", "1000")
		profile = "standard"
	}

	if detectServices {
		args = append(args, "-sV")
	}

	args = append(args, target)

	start := time.Now()
	cmd := exec.CommandContext(ctx, "nmap", args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("nmap failed: %w (stderr: %s)", err, stderr.String())
	}

	scanMs := float64(time.Since(start).Milliseconds())

	result := &PortScanResult{
		Target:  target,
		Profile: profile,
		Ports:   []PortResult{},
		ScanMs:  scanMs,
	}

	var nmapOut nmapXML
	if err := xml.Unmarshal(stdout.Bytes(), &nmapOut); err != nil {
		return nil, fmt.Errorf("failed to parse nmap output: %w", err)
	}

	for _, host := range nmapOut.Hosts {
		for _, p := range host.Ports.Ports {
			if p.State.State != "open" {
				continue
			}
			pr := PortResult{
				Port:     p.PortID,
				Protocol: p.Protocol,
				State:    p.State.State,
				Service:  p.Service.Name,
			}
			if detectServices && p.Service.Product != "" {
				parts := []string{p.Service.Product}
				if p.Service.Version != "" {
					parts = append(parts, p.Service.Version)
				}
				pr.Version = strings.Join(parts, " ")
			}
			result.Ports = append(result.Ports, pr)
		}
	}

	return result, nil
}

// portString converts an int port to string — kept for potential future use.
func portString(p int) string {
	return strconv.Itoa(p)
}
