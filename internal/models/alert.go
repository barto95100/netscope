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
