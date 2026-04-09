package queue

import (
	"testing"
	"time"
)

const testNatsURL = "nats://localhost:4222"

func TestPublishAndSubscribe(t *testing.T) {
	sub, err := NewSubscriber(testNatsURL)
	if err != nil {
		t.Fatalf("failed to create subscriber: %v", err)
	}
	defer sub.Close()

	pub, err := NewPublisher(testNatsURL)
	if err != nil {
		t.Fatalf("failed to create publisher: %v", err)
	}
	defer pub.Close()

	received := make(chan ScanJob, 1)

	if err := sub.SubscribeScanJobs(func(job ScanJob) {
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

	if err := pub.PublishScanJob(want); err != nil {
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
