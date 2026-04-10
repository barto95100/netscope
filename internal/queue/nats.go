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

// NATSQueue implements JobQueue using NATS.
type NATSQueue struct {
	conn *nats.Conn
}

func NewNATSQueue(natsURL string) (*NATSQueue, error) {
	conn, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}
	return &NATSQueue{conn: conn}, nil
}

func (q *NATSQueue) PublishJob(job ScanJob) error {
	data, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal scan job: %w", err)
	}
	return q.conn.Publish(SubjectScanJobs, data)
}

func (q *NATSQueue) PublishProgress(progress ScanProgress) error {
	data, err := json.Marshal(progress)
	if err != nil {
		return fmt.Errorf("failed to marshal scan progress: %w", err)
	}
	subject := SubjectScanProgress + "." + progress.ScanID
	return q.conn.Publish(subject, data)
}

func (q *NATSQueue) SubscribeJobs(handler func(ScanJob)) error {
	_, err := q.conn.Subscribe(SubjectScanJobs, func(msg *nats.Msg) {
		var job ScanJob
		if err := json.Unmarshal(msg.Data, &job); err != nil {
			return
		}
		handler(job)
	})
	return err
}

func (q *NATSQueue) SubscribeProgress(scanID string, handler func(ScanProgress)) (*nats.Subscription, error) {
	subject := SubjectScanProgress + "." + scanID
	sub, err := q.conn.Subscribe(subject, func(msg *nats.Msg) {
		var progress ScanProgress
		if err := json.Unmarshal(msg.Data, &progress); err != nil {
			return
		}
		handler(progress)
	})
	return sub, err
}

func (q *NATSQueue) IsConnected() bool {
	return q.conn.IsConnected()
}

func (q *NATSQueue) Close() {
	q.conn.Close()
}
