package queue

import (
	"testing"
	"time"
)

const testNatsURL = "nats://localhost:4222"

func TestPublishAndSubscribe(t *testing.T) {
	q, err := NewNATSQueue(testNatsURL)
	if err != nil {
		t.Fatalf("failed to create queue: %v", err)
	}
	defer q.Close()

	received := make(chan ScanJob, 1)

	if err := q.SubscribeJobs(func(job ScanJob) {
		received <- job
	}); err != nil {
		t.Fatalf("failed to subscribe to scan jobs: %v", err)
	}

	// Give the subscription time to register
	time.Sleep(10 * time.Millisecond)

	want := ScanJob{
		ScanID: "test-scan-123",
		Type:   "ping",
		Target: "8.8.8.8",
	}

	if err := q.PublishJob(want); err != nil {
		t.Fatalf("failed to publish scan job: %v", err)
	}

	select {
	case got := <-received:
		if got.ScanID != want.ScanID {
			t.Errorf("ScanID: got %q, want %q", got.ScanID, want.ScanID)
		}
		if got.Type != want.Type {
			t.Errorf("Type: got %q, want %q", got.Type, want.Type)
		}
		if got.Target != want.Target {
			t.Errorf("Target: got %q, want %q", got.Target, want.Target)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for scan job message")
	}
}
