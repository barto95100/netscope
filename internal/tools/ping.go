package tools

import (
	"context"
	"fmt"
	"time"

	probing "github.com/prometheus-community/pro-bing"
)

// PingResult holds the results of a ping operation (all times in ms).
type PingResult struct {
	PacketsSent int     `json:"packets_sent"`
	PacketsRecv int     `json:"packets_recv"`
	PacketLoss  float64 `json:"packet_loss"`
	MinRtt      float64 `json:"min_rtt_ms"`
	AvgRtt      float64 `json:"avg_rtt_ms"`
	MaxRtt      float64 `json:"max_rtt_ms"`
	StdDevRtt   float64 `json:"stddev_rtt_ms"`
}

// Ping sends ICMP echo requests to the target and returns statistics.
// count is capped between 1 and 100.
func Ping(ctx context.Context, target string, count int) (*PingResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	if count < 1 {
		count = 1
	}
	if count > 100 {
		count = 100
	}

	pinger, err := probing.NewPinger(target)
	if err != nil {
		return nil, fmt.Errorf("failed to create pinger: %w", err)
	}

	pinger.Count = count
	pinger.Timeout = 30 * time.Second
	pinger.SetPrivileged(false)

	// Honour context cancellation
	go func() {
		<-ctx.Done()
		pinger.Stop()
	}()

	if err := pinger.Run(); err != nil {
		return nil, fmt.Errorf("ping failed: %w", err)
	}

	stats := pinger.Statistics()

	return &PingResult{
		PacketsSent: stats.PacketsSent,
		PacketsRecv: stats.PacketsRecv,
		PacketLoss:  stats.PacketLoss,
		MinRtt:      float64(stats.MinRtt) / float64(time.Millisecond),
		AvgRtt:      float64(stats.AvgRtt) / float64(time.Millisecond),
		MaxRtt:      float64(stats.MaxRtt) / float64(time.Millisecond),
		StdDevRtt:   float64(stats.StdDevRtt) / float64(time.Millisecond),
	}, nil
}
