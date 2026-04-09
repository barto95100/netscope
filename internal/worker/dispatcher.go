package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/models"
	"github.com/barto/netscope/internal/queue"
	"github.com/barto/netscope/internal/tools"
)

// Dispatcher receives scan jobs and dispatches them to the appropriate tool.
type Dispatcher struct {
	DB        *database.DB
	Publisher *queue.Publisher
}

// jobOptions holds the common options that can appear in a ScanJob.Options payload.
type jobOptions struct {
	Count          int      `json:"count"`
	Profile        string   `json:"profile"`
	DetectServices bool     `json:"detect_services"`
	MaxHops        int      `json:"max_hops"`
	Types          []string `json:"types"`
}

// HandleJob processes a single ScanJob end-to-end:
//  1. Updates the scan status to "running".
//  2. Executes the appropriate tool.
//  3. Saves the result or error to the database.
//  4. Publishes a progress event.
func (d *Dispatcher) HandleJob(ctx context.Context, job queue.ScanJob) {
	now := time.Now()

	// Mark scan as running
	if err := models.UpdateScanStatus(ctx, d.DB, job.ScanID, "running", &now, nil); err != nil {
		log.Printf("dispatcher: failed to mark scan %s as running: %v", job.ScanID, err)
		return
	}

	d.publishProgress(ctx, job.ScanID, "running", nil)

	// Execute the tool
	result, execErr := d.execute(ctx, job)

	completedAt := time.Now()

	if execErr != nil {
		errMsg := execErr.Error()
		if dbErr := models.UpdateScanError(ctx, d.DB, job.ScanID, "failed", errMsg, &completedAt); dbErr != nil {
			log.Printf("dispatcher: failed to save error for scan %s: %v", job.ScanID, dbErr)
		}
		d.publishProgress(ctx, job.ScanID, "failed", nil)
		log.Printf("dispatcher: scan %s failed: %v", job.ScanID, execErr)
		return
	}

	if dbErr := models.UpdateScanResult(ctx, d.DB, job.ScanID, result.Data); dbErr != nil {
		log.Printf("dispatcher: failed to save result for scan %s: %v", job.ScanID, dbErr)
	}
	if dbErr := models.UpdateScanStatus(ctx, d.DB, job.ScanID, "completed", nil, &completedAt); dbErr != nil {
		log.Printf("dispatcher: failed to mark scan %s as completed: %v", job.ScanID, dbErr)
	}

	d.publishProgress(ctx, job.ScanID, "completed", result.Data)
}

// execute routes the job to the appropriate tool and returns the result.
func (d *Dispatcher) execute(ctx context.Context, job queue.ScanJob) (*ExecutorResult, error) {
	opts := parseOptions(job.Options)

	// Strip URL scheme for non-HTTP tools
	target := job.Target
	if job.Type != "headers" {
		target = tools.StripURLScheme(target)
	}

	switch job.Type {
	case "ping":
		count := opts.Count
		if count <= 0 {
			count = 5
		}
		res, err := tools.Ping(ctx, target, count)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "dns":
		res, err := tools.DNSLookup(ctx, target, opts.Types)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "whois":
		res, err := tools.WhoisLookup(ctx, target)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "ssl":
		res, err := tools.SSLAudit(ctx, target)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "headers":
		res, err := tools.CheckHTTPHeaders(ctx, job.Target)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "portscan":
		profile := opts.Profile
		if profile == "" {
			profile = "standard"
		}
		res, err := tools.PortScan(ctx, target, profile, opts.DetectServices)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "traceroute":
		res, err := tools.Traceroute(ctx, target, opts.MaxHops)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	case "mtr":
		count := opts.Count
		if count <= 0 {
			count = 10
		}
		res, err := tools.MTR(ctx, target, count)
		if err != nil {
			return nil, err
		}
		return marshalResult(res)

	default:
		return nil, fmt.Errorf("unknown scan type: %s", job.Type)
	}
}

// parseOptions parses the common options from the job's JSON options payload.
func parseOptions(raw json.RawMessage) jobOptions {
	var opts jobOptions
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &opts)
	}
	return opts
}

// marshalResult converts any value to an ExecutorResult with JSON data.
func marshalResult(v interface{}) (*ExecutorResult, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal result: %w", err)
	}
	return &ExecutorResult{Data: data}, nil
}

// publishProgress sends a scan progress event, logging errors rather than failing.
func (d *Dispatcher) publishProgress(ctx context.Context, scanID, status string, data json.RawMessage) {
	progress := queue.ScanProgress{
		ScanID: scanID,
		Status: status,
		Data:   data,
	}
	if err := d.Publisher.PublishScanProgress(progress); err != nil {
		log.Printf("dispatcher: failed to publish progress for scan %s: %v", scanID, err)
	}
}
