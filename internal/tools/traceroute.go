package tools

import (
	"context"
	"fmt"
	"net"
	"time"

	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
)

// TracerouteHop represents a single hop in a traceroute.
type TracerouteHop struct {
	TTL     int     `json:"ttl"`
	Address string  `json:"address"`
	RTT     float64 `json:"rtt_ms"`
	Timeout bool    `json:"timeout"`
}

// TracerouteResult holds the result of a traceroute operation.
type TracerouteResult struct {
	Target string          `json:"target"`
	Hops   []TracerouteHop `json:"hops"`
}

// Traceroute performs a traceroute to the target using raw ICMP sockets.
// maxHops caps the number of hops; values <=0 default to 30.
func Traceroute(ctx context.Context, target string, maxHops int) (*TracerouteResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	if maxHops <= 0 {
		maxHops = 30
	}

	// Resolve the target address
	addrs, err := net.LookupHost(target)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve target: %w", err)
	}
	destAddr := addrs[0]

	result := &TracerouteResult{
		Target: target,
		Hops:   []TracerouteHop{},
	}

	// Open a privileged ICMP listener
	conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
	if err != nil {
		// Fallback: return an error with a helpful message
		return nil, fmt.Errorf("traceroute requires raw socket access (try running as root or with CAP_NET_RAW): %w", err)
	}
	defer conn.Close()

	dst := &net.IPAddr{IP: net.ParseIP(destAddr)}
	if dst.IP == nil {
		return nil, fmt.Errorf("invalid destination IP: %s", destAddr)
	}

	p4 := conn.IPv4PacketConn()

	for ttl := 1; ttl <= maxHops; ttl++ {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		if err := p4.SetTTL(ttl); err != nil {
			return nil, fmt.Errorf("failed to set TTL: %w", err)
		}

		msg := icmp.Message{
			Type: ipv4.ICMPTypeEcho,
			Code: 0,
			Body: &icmp.Echo{
				ID:   ttl,
				Seq:  ttl,
				Data: []byte("netscope"),
			},
		}
		data, err := msg.Marshal(nil)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal ICMP message: %w", err)
		}

		start := time.Now()
		if _, err := conn.WriteTo(data, dst); err != nil {
			return nil, fmt.Errorf("failed to send ICMP packet: %w", err)
		}

		conn.SetReadDeadline(time.Now().Add(3 * time.Second)) //nolint:errcheck

		reply := make([]byte, 1500)
		n, peer, err := conn.ReadFrom(reply)
		rtt := float64(time.Since(start).Microseconds()) / 1000.0

		if err != nil {
			// Timeout
			result.Hops = append(result.Hops, TracerouteHop{
				TTL:     ttl,
				Timeout: true,
			})
			continue
		}

		rm, err := icmp.ParseMessage(1, reply[:n])
		if err != nil {
			result.Hops = append(result.Hops, TracerouteHop{
				TTL:     ttl,
				Address: peer.String(),
				RTT:     rtt,
			})
			continue
		}

		hop := TracerouteHop{
			TTL:     ttl,
			Address: peer.String(),
			RTT:     rtt,
		}
		result.Hops = append(result.Hops, hop)

		// Echo Reply means we reached the destination
		if rm.Type == ipv4.ICMPTypeEchoReply {
			break
		}
	}

	return result, nil
}
