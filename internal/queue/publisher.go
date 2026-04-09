package queue

import (
	"encoding/json"
	"fmt"

	"github.com/nats-io/nats.go"
)

const (
	SubjectScanJobs     = "netscope.scans.jobs"
	SubjectScanProgress = "netscope.scans.progress"
)

type ScanJob struct {
	ScanID  string          `json:"scan_id"`
	Type    string          `json:"type"`
	Target  string          `json:"target"`
	Options json.RawMessage `json:"options,omitempty"`
}

type ScanProgress struct {
	ScanID string          `json:"scan_id"`
	Status string          `json:"status"`
	Data   json.RawMessage `json:"data,omitempty"`
}

type Publisher struct {
	conn *nats.Conn
}

func NewPublisher(natsURL string) (*Publisher, error) {
	conn, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}
	return &Publisher{conn: conn}, nil
}

func (p *Publisher) PublishScanJob(job ScanJob) error {
	data, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal scan job: %w", err)
	}
	if err := p.conn.Publish(SubjectScanJobs, data); err != nil {
		return fmt.Errorf("failed to publish scan job: %w", err)
	}
	return nil
}

func (p *Publisher) PublishScanProgress(progress ScanProgress) error {
	data, err := json.Marshal(progress)
	if err != nil {
		return fmt.Errorf("failed to marshal scan progress: %w", err)
	}
	subject := SubjectScanProgress + "." + progress.ScanID
	if err := p.conn.Publish(subject, data); err != nil {
		return fmt.Errorf("failed to publish scan progress: %w", err)
	}
	return nil
}

func (p *Publisher) Close() {
	p.conn.Close()
}
