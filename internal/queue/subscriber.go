package queue

import (
	"encoding/json"
	"fmt"

	"github.com/nats-io/nats.go"
)

type Subscriber struct {
	conn *nats.Conn
}

func NewSubscriber(natsURL string) (*Subscriber, error) {
	conn, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}
	return &Subscriber{conn: conn}, nil
}

func (s *Subscriber) SubscribeScanJobs(handler func(ScanJob)) error {
	_, err := s.conn.Subscribe(SubjectScanJobs, func(msg *nats.Msg) {
		var job ScanJob
		if err := json.Unmarshal(msg.Data, &job); err != nil {
			return
		}
		handler(job)
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to scan jobs: %w", err)
	}
	return nil
}

func (s *Subscriber) SubscribeScanProgress(scanID string, handler func(ScanProgress)) (*nats.Subscription, error) {
	subject := SubjectScanProgress + "." + scanID
	sub, err := s.conn.Subscribe(subject, func(msg *nats.Msg) {
		var progress ScanProgress
		if err := json.Unmarshal(msg.Data, &progress); err != nil {
			return
		}
		handler(progress)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe to scan progress: %w", err)
	}
	return sub, nil
}

func (s *Subscriber) Close() {
	s.conn.Close()
}
