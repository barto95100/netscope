package models

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/barto/netscope/internal/database"
)

type Alert struct {
	ID         string     `json:"id"`
	MonitorID  *string    `json:"monitor_id"`
	ScanID     *string    `json:"scan_id"`
	Severity   string     `json:"severity"`
	Title      string     `json:"title"`
	Message    *string    `json:"message"`
	Status     string     `json:"status"`
	ResolvedAt *time.Time `json:"resolved_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

func CreateAlert(ctx context.Context, db *database.DB, monitorID, scanID *string, severity, title string, message *string) (*Alert, error) {
	var a Alert
	row := db.Pool.QueryRow(ctx,
		`INSERT INTO alerts (monitor_id, scan_id, severity, title, message)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, monitor_id, scan_id, severity, title, message, status, resolved_at, created_at`,
		monitorID, scanID, severity, title, message,
	)
	err := row.Scan(&a.ID, &a.MonitorID, &a.ScanID, &a.Severity, &a.Title, &a.Message, &a.Status, &a.ResolvedAt, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateAlert: %w", err)
	}
	return &a, nil
}

func UpdateAlertStatus(ctx context.Context, db *database.DB, id, status string, resolvedAt *time.Time) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE alerts SET status = $2, resolved_at = COALESCE($3, resolved_at) WHERE id = $1`,
		id, status, resolvedAt,
	)
	if err != nil {
		return fmt.Errorf("UpdateAlertStatus: %w", err)
	}
	return nil
}

// GetActiveAlertForMonitor returns the active alert for a monitor, or nil if none.
func GetActiveAlertForMonitor(ctx context.Context, db *database.DB, monitorID string) (*Alert, error) {
	var a Alert
	row := db.Pool.QueryRow(ctx,
		`SELECT id, monitor_id, scan_id, severity, title, message, status, resolved_at, created_at
		 FROM alerts WHERE monitor_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
		monitorID,
	)
	err := row.Scan(&a.ID, &a.MonitorID, &a.ScanID, &a.Severity, &a.Title, &a.Message, &a.Status, &a.ResolvedAt, &a.CreatedAt)
	if err != nil {
		return nil, err // pgx.ErrNoRows if none
	}
	return &a, nil
}

// CountRecentFailures counts how many consecutive "down" results a monitor has (most recent first).
func CountRecentFailures(ctx context.Context, db *database.DB, monitorID string, limit int) (int, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT status FROM monitor_results WHERE monitor_id = $1 ORDER BY checked_at DESC LIMIT $2`,
		monitorID, limit,
	)
	if err != nil {
		return 0, fmt.Errorf("CountRecentFailures: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return 0, err
		}
		if s != "down" {
			break
		}
		count++
	}
	return count, rows.Err()
}

func ListAlerts(ctx context.Context, db *database.DB, status, severity string, limit, offset int) ([]Alert, error) {
	args := []interface{}{}
	conds := []string{}
	i := 1

	if status != "" {
		conds = append(conds, fmt.Sprintf("status = $%d", i))
		args = append(args, status)
		i++
	}
	if severity != "" {
		conds = append(conds, fmt.Sprintf("severity = $%d", i))
		args = append(args, severity)
		i++
	}

	where := ""
	if len(conds) > 0 {
		where = "WHERE " + strings.Join(conds, " AND ")
	}

	args = append(args, limit, offset)
	q := fmt.Sprintf(
		`SELECT id, monitor_id, scan_id, severity, title, message, status, resolved_at, created_at
		 FROM alerts %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		where, i, i+1,
	)

	rows, err := db.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("ListAlerts: %w", err)
	}
	defer rows.Close()

	var alerts []Alert
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.MonitorID, &a.ScanID, &a.Severity, &a.Title, &a.Message, &a.Status, &a.ResolvedAt, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("ListAlerts scan: %w", err)
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}
