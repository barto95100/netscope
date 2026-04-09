package models

import (
	"context"
	"testing"
	"time"
)

func TestCreateMonitor(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "Test HTTP Monitor", "http", "https://example.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", m.ID)
	})

	if m.ID == "" {
		t.Error("expected non-empty ID")
	}
	if m.Name != "Test HTTP Monitor" {
		t.Errorf("expected name=%q, got %q", "Test HTTP Monitor", m.Name)
	}
	if m.Type != "http" {
		t.Errorf("expected type=http, got %q", m.Type)
	}
	if !m.Enabled {
		t.Error("expected enabled=true by default")
	}
	if m.LastStatus != "unknown" {
		t.Errorf("expected last_status=unknown, got %q", m.LastStatus)
	}
}

func TestGetMonitor(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	created, err := CreateMonitor(ctx, db, "Ping Monitor", "icmp", "8.8.8.8", 30, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", created.ID)
	})

	got, err := GetMonitor(ctx, db, created.ID)
	if err != nil {
		t.Fatalf("GetMonitor: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID mismatch: got %q want %q", got.ID, created.ID)
	}
	if got.IntervalSec != 30 {
		t.Errorf("expected interval_sec=30, got %d", got.IntervalSec)
	}
}

func TestUpdateMonitor(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "Original Name", "http", "https://old.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", m.ID)
	})

	if err := UpdateMonitor(ctx, db, m.ID, "Updated Name", "https://new.com", 120, nil, false); err != nil {
		t.Fatalf("UpdateMonitor: %v", err)
	}

	updated, err := GetMonitor(ctx, db, m.ID)
	if err != nil {
		t.Fatalf("GetMonitor after update: %v", err)
	}
	if updated.Name != "Updated Name" {
		t.Errorf("expected name=%q, got %q", "Updated Name", updated.Name)
	}
	if updated.Target != "https://new.com" {
		t.Errorf("expected target=%q, got %q", "https://new.com", updated.Target)
	}
	if updated.IntervalSec != 120 {
		t.Errorf("expected interval_sec=120, got %d", updated.IntervalSec)
	}
	if updated.Enabled {
		t.Error("expected enabled=false")
	}
}

func TestUpdateMonitorStatus(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "Status Monitor", "http", "https://example.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", m.ID)
	})

	now := time.Now().UTC()
	if err := UpdateMonitorStatus(ctx, db, m.ID, "up", &now); err != nil {
		t.Fatalf("UpdateMonitorStatus: %v", err)
	}

	updated, err := GetMonitor(ctx, db, m.ID)
	if err != nil {
		t.Fatalf("GetMonitor after status update: %v", err)
	}
	if updated.LastStatus != "up" {
		t.Errorf("expected last_status=up, got %q", updated.LastStatus)
	}
	if updated.LastCheckedAt == nil {
		t.Error("expected last_checked_at to be set")
	}
}

func TestDeleteMonitor(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "Delete Me", "http", "https://gone.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}

	if err := DeleteMonitor(ctx, db, m.ID); err != nil {
		t.Fatalf("DeleteMonitor: %v", err)
	}

	_, err = GetMonitor(ctx, db, m.ID)
	if err == nil {
		t.Error("expected error after deleting monitor, got nil")
	}
}

func TestListMonitors(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m1, err := CreateMonitor(ctx, db, "List Monitor 1", "http", "https://a.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor 1: %v", err)
	}
	m2, err := CreateMonitor(ctx, db, "List Monitor 2", "http", "https://b.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor 2: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id IN ($1, $2)", m1.ID, m2.ID)
	})

	monitors, err := ListMonitors(ctx, db, 10, 0)
	if err != nil {
		t.Fatalf("ListMonitors: %v", err)
	}
	if len(monitors) < 2 {
		t.Errorf("expected at least 2 monitors, got %d", len(monitors))
	}
}

func TestCreateMonitorResult(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "Result Monitor", "http", "https://example.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", m.ID)
	})

	latency := float32(42.5)
	code := int16(200)
	r, err := CreateMonitorResult(ctx, db, m.ID, "up", &latency, &code, nil)
	if err != nil {
		t.Fatalf("CreateMonitorResult: %v", err)
	}

	if r.ID == 0 {
		t.Error("expected non-zero ID")
	}
	if r.MonitorID != m.ID {
		t.Errorf("MonitorID mismatch: got %q want %q", r.MonitorID, m.ID)
	}
	if r.LatencyMs == nil || *r.LatencyMs != 42.5 {
		t.Errorf("expected LatencyMs=42.5, got %v", r.LatencyMs)
	}
	if r.StatusCode == nil || *r.StatusCode != 200 {
		t.Errorf("expected StatusCode=200, got %v", r.StatusCode)
	}
}

func TestListMonitorResults(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "List Result Monitor", "http", "https://example.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", m.ID)
	})

	latency := float32(10.0)
	for i := 0; i < 3; i++ {
		_, err := CreateMonitorResult(ctx, db, m.ID, "up", &latency, nil, nil)
		if err != nil {
			t.Fatalf("CreateMonitorResult %d: %v", i, err)
		}
	}

	results, err := ListMonitorResults(ctx, db, m.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListMonitorResults: %v", err)
	}
	if len(results) != 3 {
		t.Errorf("expected 3 results, got %d", len(results))
	}
}
