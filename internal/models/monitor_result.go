package models

import (
	"context"
	"fmt"
	"time"

	"github.com/barto/netscope/internal/database"
)

type MonitorResult struct {
	ID         int64      `json:"id"`
	MonitorID  string     `json:"monitor_id"`
	Status     string     `json:"status"`
	LatencyMs  *float32   `json:"latency_ms"`
	StatusCode *int16     `json:"status_code"`
	Error      *string    `json:"error"`
	CheckedAt  time.Time  `json:"checked_at"`
}

func CreateMonitorResult(ctx context.Context, db *database.DB, monitorID, status string, latencyMs *float32, statusCode *int16, errMsg *string) (*MonitorResult, error) {
	var r MonitorResult
	row := db.Pool.QueryRow(ctx,
		`INSERT INTO monitor_results (monitor_id, status, latency_ms, status_code, error)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, monitor_id, status, latency_ms, status_code, error, checked_at`,
		monitorID, status, latencyMs, statusCode, errMsg,
	)
	err := row.Scan(&r.ID, &r.MonitorID, &r.Status, &r.LatencyMs, &r.StatusCode, &r.Error, &r.CheckedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateMonitorResult: %w", err)
	}
	return &r, nil
}

func ListMonitorResults(ctx context.Context, db *database.DB, monitorID string, limit, offset int) ([]MonitorResult, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, monitor_id, status, latency_ms, status_code, error, checked_at
		 FROM monitor_results
		 WHERE monitor_id = $1
		 ORDER BY checked_at DESC
		 LIMIT $2 OFFSET $3`,
		monitorID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("ListMonitorResults: %w", err)
	}
	defer rows.Close()

	var results []MonitorResult
	for rows.Next() {
		var r MonitorResult
		if err := rows.Scan(&r.ID, &r.MonitorID, &r.Status, &r.LatencyMs, &r.StatusCode, &r.Error, &r.CheckedAt); err != nil {
			return nil, fmt.Errorf("ListMonitorResults scan: %w", err)
		}
		results = append(results, r)
	}
	return results, rows.Err()
}
