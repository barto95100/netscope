package models

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/barto/netscope/internal/database"
)

func testDB(t *testing.T) *database.DB {
	t.Helper()
	ctx := context.Background()
	db, err := database.Connect(ctx, "postgres://netscope:netscope@localhost:5432/netscope")
	if err != nil {
		t.Fatalf("testDB: connect: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestCreateScan(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	opts := json.RawMessage(`{"timeout": 30}`)
	s, err := CreateScan(ctx, db, "ping", "8.8.8.8", opts)
	if err != nil {
		t.Fatalf("CreateScan: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM scans WHERE id = $1", s.ID)
	})

	if s.ID == "" {
		t.Error("expected non-empty ID")
	}
	if s.Type != "ping" {
		t.Errorf("expected type=ping, got %q", s.Type)
	}
	if s.Status != "pending" {
		t.Errorf("expected status=pending, got %q", s.Status)
	}
	if s.Target != "8.8.8.8" {
		t.Errorf("expected target=8.8.8.8, got %q", s.Target)
	}
}

func TestGetScan(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	created, err := CreateScan(ctx, db, "traceroute", "1.1.1.1", nil)
	if err != nil {
		t.Fatalf("CreateScan: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM scans WHERE id = $1", created.ID)
	})

	got, err := GetScan(ctx, db, created.ID)
	if err != nil {
		t.Fatalf("GetScan: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID mismatch: got %q want %q", got.ID, created.ID)
	}
	if got.Type != "traceroute" {
		t.Errorf("Type mismatch: got %q want traceroute", got.Type)
	}
}

func TestUpdateScanStatus(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	s, err := CreateScan(ctx, db, "dns", "example.com", nil)
	if err != nil {
		t.Fatalf("CreateScan: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM scans WHERE id = $1", s.ID)
	})

	now := time.Now().UTC()
	if err := UpdateScanStatus(ctx, db, s.ID, "running", &now, nil); err != nil {
		t.Fatalf("UpdateScanStatus: %v", err)
	}

	updated, err := GetScan(ctx, db, s.ID)
	if err != nil {
		t.Fatalf("GetScan after update: %v", err)
	}
	if updated.Status != "running" {
		t.Errorf("expected status=running, got %q", updated.Status)
	}
	if updated.StartedAt == nil {
		t.Error("expected StartedAt to be set")
	}
}

func TestListScans(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	s1, err := CreateScan(ctx, db, "ping", "10.0.0.1", nil)
	if err != nil {
		t.Fatalf("CreateScan 1: %v", err)
	}
	s2, err := CreateScan(ctx, db, "ping", "10.0.0.2", nil)
	if err != nil {
		t.Fatalf("CreateScan 2: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM scans WHERE id IN ($1, $2)", s1.ID, s2.ID)
	})

	scans, err := ListScans(ctx, db, "ping", "", 10, 0)
	if err != nil {
		t.Fatalf("ListScans: %v", err)
	}
	if len(scans) < 2 {
		t.Errorf("expected at least 2 scans, got %d", len(scans))
	}

	// Filter by status
	scans2, err := ListScans(ctx, db, "", "pending", 10, 0)
	if err != nil {
		t.Fatalf("ListScans by status: %v", err)
	}
	for _, sc := range scans2 {
		if sc.Status != "pending" {
			t.Errorf("expected status=pending, got %q", sc.Status)
		}
	}
}
