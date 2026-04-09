package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"
)

// MTRHop holds per-hop statistics from an MTR run.
type MTRHop struct {
	Host   string  `json:"host"`
	Loss   float64 `json:"loss_pct"`
	Sent   int     `json:"sent"`
	Recv   int     `json:"recv"`
	Best   float64 `json:"best_ms"`
	Avg    float64 `json:"avg_ms"`
	Worst  float64 `json:"worst_ms"`
	StdDev float64 `json:"stddev_ms"`
}

// MTRResult holds the complete MTR output.
type MTRResult struct {
	Target string   `json:"target"`
	Hops   []MTRHop `json:"hops"`
}

// mtrJSON mirrors the JSON output structure of `mtr --json --report`.
type mtrJSON struct {
	Report mtrReport `json:"report"`
}

type mtrReport struct {
	Hubs []mtrHub `json:"hubs"`
}

type mtrHub struct {
	Count int     `json:"count"`
	Host  string  `json:"host"`
	Loss  float64 `json:"Loss%"`
	Snt   int     `json:"Snt"`
	Last  float64 `json:"Last"`
	Avg   float64 `json:"Avg"`
	Best  float64 `json:"Best"`
	Wrst  float64 `json:"Wrst"`
	StDev float64 `json:"StDev"`
}

// MTR runs `mtr --json --report` against the target and returns structured results.
// count is the number of pings per hop; values <=0 default to 10.
func MTR(ctx context.Context, target string, count int) (*MTRResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	if count <= 0 {
		count = 10
	}

	// Build the command – never via sh -c
	args := []string{
		"--json",
		"--report",
		"--report-cycles", fmt.Sprintf("%d", count),
		target,
	}

	cmd := exec.CommandContext(ctx, "mtr", args...)
	cmd.WaitDelay = 60 * time.Second

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("mtr failed: %w (stderr: %s)", err, stderr.String())
	}

	var mtrOut mtrJSON
	if err := json.Unmarshal(stdout.Bytes(), &mtrOut); err != nil {
		return nil, fmt.Errorf("failed to parse mtr output: %w", err)
	}

	result := &MTRResult{
		Target: target,
		Hops:   make([]MTRHop, 0, len(mtrOut.Report.Hubs)),
	}

	for _, hub := range mtrOut.Report.Hubs {
		recv := 0
		if hub.Snt > 0 {
			recv = int(float64(hub.Snt) * (1.0 - hub.Loss/100.0))
		}
		result.Hops = append(result.Hops, MTRHop{
			Host:   hub.Host,
			Loss:   hub.Loss,
			Sent:   hub.Snt,
			Recv:   recv,
			Best:   hub.Best,
			Avg:    hub.Avg,
			Worst:  hub.Wrst,
			StdDev: hub.StDev,
		})
	}

	return result, nil
}
