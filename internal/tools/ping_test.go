package tools

import (
	"context"
	"testing"
)

func TestPing(t *testing.T) {
	ctx := context.Background()
	result, err := Ping(ctx, "127.0.0.1", 3)
	if err != nil {
		t.Fatalf("Ping returned error: %v", err)
	}
	if result.PacketsSent != 3 {
		t.Errorf("expected PacketsSent=3, got %d", result.PacketsSent)
	}
	if result.PacketsRecv < 1 {
		t.Errorf("expected at least 1 packet received, got %d", result.PacketsRecv)
	}
}
