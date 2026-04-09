package models

import (
	"context"
	"testing"
	"time"
)

func TestCreateAlert(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	msg := "Something went down"
	a, err := CreateAlert(ctx, db, nil, nil, "critical", "Test Alert", &msg)
	if err != nil {
		t.Fatalf("CreateAlert: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM alerts WHERE id = $1", a.ID)
	})

	if a.ID == "" {
		t.Error("expected non-empty ID")
	}
	if a.Severity != "critical" {
		t.Errorf("expected severity=critical, got %q", a.Severity)
	}
	if a.Title != "Test Alert" {
		t.Errorf("expected title=%q, got %q", "Test Alert", a.Title)
	}
	if a.Status != "active" {
		t.Errorf("expected status=active, got %q", a.Status)
	}
	if a.Message == nil || *a.Message != msg {
		t.Errorf("expected message=%q, got %v", msg, a.Message)
	}
}

func TestCreateAlertWithMonitor(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	m, err := CreateMonitor(ctx, db, "Alert Monitor", "http", "https://example.com", 60, nil)
	if err != nil {
		t.Fatalf("CreateMonitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM monitors WHERE id = $1", m.ID)
	})

	a, err := CreateAlert(ctx, db, &m.ID, nil, "warning", "Monitor Alert", nil)
	if err != nil {
		t.Fatalf("CreateAlert with monitor: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM alerts WHERE id = $1", a.ID)
	})

	if a.MonitorID == nil || *a.MonitorID != m.ID {
		t.Errorf("expected MonitorID=%q, got %v", m.ID, a.MonitorID)
	}
}

func TestUpdateAlertStatus(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	a, err := CreateAlert(ctx, db, nil, nil, "info", "Status Alert", nil)
	if err != nil {
		t.Fatalf("CreateAlert: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM alerts WHERE id = $1", a.ID)
	})

	now := time.Now().UTC()
	if err := UpdateAlertStatus(ctx, db, a.ID, "resolved", &now); err != nil {
		t.Fatalf("UpdateAlertStatus: %v", err)
	}

	// Verify by listing
	alerts, err := ListAlerts(ctx, db, "resolved", "", 10, 0)
	if err != nil {
		t.Fatalf("ListAlerts: %v", err)
	}
	found := false
	for _, al := range alerts {
		if al.ID == a.ID {
			found = true
			if al.Status != "resolved" {
				t.Errorf("expected status=resolved, got %q", al.Status)
			}
			if al.ResolvedAt == nil {
				t.Error("expected resolved_at to be set")
			}
		}
	}
	if !found {
		t.Error("alert not found in resolved list")
	}
}

func TestListAlerts(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	a1, err := CreateAlert(ctx, db, nil, nil, "critical", "List Alert 1", nil)
	if err != nil {
		t.Fatalf("CreateAlert 1: %v", err)
	}
	a2, err := CreateAlert(ctx, db, nil, nil, "warning", "List Alert 2", nil)
	if err != nil {
		t.Fatalf("CreateAlert 2: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(ctx, "DELETE FROM alerts WHERE id IN ($1, $2)", a1.ID, a2.ID)
	})

	// List all active
	all, err := ListAlerts(ctx, db, "active", "", 10, 0)
	if err != nil {
		t.Fatalf("ListAlerts all active: %v", err)
	}
	if len(all) < 2 {
		t.Errorf("expected at least 2 active alerts, got %d", len(all))
	}

	// Filter by severity
	critical, err := ListAlerts(ctx, db, "", "critical", 10, 0)
	if err != nil {
		t.Fatalf("ListAlerts critical: %v", err)
	}
	for _, al := range critical {
		if al.Severity != "critical" {
			t.Errorf("expected severity=critical, got %q", al.Severity)
		}
	}

	// Filter by both
	activeCritical, err := ListAlerts(ctx, db, "active", "critical", 10, 0)
	if err != nil {
		t.Fatalf("ListAlerts active+critical: %v", err)
	}
	foundA1 := false
	for _, al := range activeCritical {
		if al.ID == a1.ID {
			foundA1 = true
		}
	}
	if !foundA1 {
		t.Error("expected to find a1 in active+critical list")
	}
}
