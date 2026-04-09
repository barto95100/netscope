package tools

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// TracerouteHop represents a single hop in a traceroute.
type TracerouteHop struct {
	TTL     int     `json:"ttl"`
	Address string  `json:"address"`
	Host    string  `json:"host,omitempty"`
	RTT     float64 `json:"rtt_ms"`
	Timeout bool    `json:"timeout"`
}

// TracerouteResult holds the result of a traceroute operation.
type TracerouteResult struct {
	Target string          `json:"target"`
	Hops   []TracerouteHop `json:"hops"`
}

// hopRegex matches traceroute output lines like:
//
//	1  gateway (192.168.1.1)  1.234 ms  1.456 ms  1.789 ms
//	2  * * *
var hopRegex = regexp.MustCompile(`^\s*(\d+)\s+(.+)$`)
var rttRegex = regexp.MustCompile(`([\d.]+)\s*ms`)
var addrRegex = regexp.MustCompile(`\(?([\d.]+)\)?`)
var hostAddrRegex = regexp.MustCompile(`(\S+)\s+\(([\d.]+)\)`)

// Traceroute runs the system traceroute command.
func Traceroute(ctx context.Context, target string, maxHops int) (*TracerouteResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	if maxHops <= 0 {
		maxHops = 30
	}
	if maxHops > 64 {
		maxHops = 64
	}

	cmd := exec.CommandContext(ctx, "traceroute", "-m", strconv.Itoa(maxHops), "-w", "2", target)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("traceroute failed: %w", err)
	}

	result := &TracerouteResult{
		Target: target,
		Hops:   []TracerouteHop{},
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()

		match := hopRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		ttl, _ := strconv.Atoi(match[1])
		rest := match[2]

		hop := TracerouteHop{TTL: ttl}

		// Check for timeout
		if strings.TrimSpace(rest) == "* * *" || strings.Count(rest, "*") >= 3 {
			hop.Timeout = true
			result.Hops = append(result.Hops, hop)
			continue
		}

		// Extract host and address
		if m := hostAddrRegex.FindStringSubmatch(rest); m != nil {
			hop.Host = m[1]
			hop.Address = m[2]
		} else if m := addrRegex.FindStringSubmatch(rest); m != nil {
			hop.Address = m[1]
		}

		// Extract best RTT
		if rtts := rttRegex.FindAllStringSubmatch(rest, -1); len(rtts) > 0 {
			best := 999999.0
			for _, r := range rtts {
				if v, err := strconv.ParseFloat(r[1], 64); err == nil && v < best {
					best = v
				}
			}
			if best < 999999.0 {
				hop.RTT = best
			}
		}

		result.Hops = append(result.Hops, hop)
	}

	return result, nil
}
