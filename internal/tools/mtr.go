package tools

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// MTRHop holds per-hop statistics from an MTR run.
type MTRHop struct {
	Host   string  `json:"host"`
	Loss   float64 `json:"loss_percent"`
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

// mtr output line: "  1.|-- 192.168.1.1    0.0%     10    0.4   0.5   0.3   0.7   0.1"
var mtrLineRegex = regexp.MustCompile(`^\s*\d+\.\|--\s+(.+)$`)

// MTR runs `mtr --report` and parses the text output.
func MTR(ctx context.Context, target string, count int) (*MTRResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	if count <= 0 {
		count = 10
	}
	if count > 100 {
		count = 100
	}

	args := []string{
		"--report",
		"--report-wide",
		"--report-cycles", fmt.Sprintf("%d", count),
		target,
	}

	cmd := exec.CommandContext(ctx, "mtr", args...)
	cmd.WaitDelay = 120 * time.Second

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("mtr failed: %w (stderr: %s)", err, stderr.String())
	}

	result := &MTRResult{
		Target: target,
		Hops:   []MTRHop{},
	}

	scanner := bufio.NewScanner(&stdout)
	for scanner.Scan() {
		line := scanner.Text()

		match := mtrLineRegex.FindStringSubmatch(line)
		if match == nil {
			continue
		}

		// Split the rest: "host  Loss%  Snt  Last  Avg  Best  Wrst  StDev"
		fields := strings.Fields(match[1])
		if len(fields) < 7 {
			continue
		}

		host := fields[0]
		lossStr := strings.TrimSuffix(fields[1], "%")
		loss, _ := strconv.ParseFloat(lossStr, 64)
		sent, _ := strconv.Atoi(fields[2])
		// fields[3] = Last (skip)
		avg, _ := strconv.ParseFloat(fields[4], 64)
		best, _ := strconv.ParseFloat(fields[5], 64)
		worst, _ := strconv.ParseFloat(fields[6], 64)
		stddev := 0.0
		if len(fields) >= 8 {
			stddev, _ = strconv.ParseFloat(fields[7], 64)
		}

		recv := sent
		if sent > 0 {
			recv = int(float64(sent) * (1.0 - loss/100.0))
		}

		result.Hops = append(result.Hops, MTRHop{
			Host:   host,
			Loss:   loss,
			Sent:   sent,
			Recv:   recv,
			Best:   best,
			Avg:    avg,
			Worst:  worst,
			StdDev: stddev,
		})
	}

	return result, nil
}
