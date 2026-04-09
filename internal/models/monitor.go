package models

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/barto/netscope/internal/database"
)

type Monitor struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Type          string          `json:"type"`
	Target        string          `json:"target"`
	IntervalSec   int             `json:"interval_sec"`
	Options       json.RawMessage `json:"options"`
	Enabled       bool            `json:"enabled"`
	LastStatus    string          `json:"last_status"`
	LastCheckedAt *time.Time      `json:"last_checked_at"`
	CreatedAt     time.Time       `json:"created_at"`
}

func CreateMonitor(ctx context.Context, db *database.DB, name, monType, target string, intervalSec int, options json.RawMessage) (*Monitor, error) {
	if options == nil {
		options = json.RawMessage("{}")
	}
	var m Monitor
	row := db.Pool.QueryRow(ctx,
		`INSERT INTO monitors (name, type, target, interval_sec, options)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, type, target, interval_sec, options, enabled, last_status, last_checked_at, created_at`,
		name, monType, target, intervalSec, []byte(options),
	)
	err := row.Scan(&m.ID, &m.Name, &m.Type, &m.Target, &m.IntervalSec, &m.Options, &m.Enabled, &m.LastStatus, &m.LastCheckedAt, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateMonitor: %w", err)
	}
	return &m, nil
}

func GetMonitor(ctx context.Context, db *database.DB, id string) (*Monitor, error) {
	var m Monitor
	row := db.Pool.QueryRow(ctx,
		`SELECT id, name, type, target, interval_sec, options, enabled, last_status, last_checked_at, created_at
		 FROM monitors WHERE id = $1`,
		id,
	)
	err := row.Scan(&m.ID, &m.Name, &m.Type, &m.Target, &m.IntervalSec, &m.Options, &m.Enabled, &m.LastStatus, &m.LastCheckedAt, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("GetMonitor: %w", err)
	}
	return &m, nil
}

func UpdateMonitor(ctx context.Context, db *database.DB, id, name, target string, intervalSec int, options json.RawMessage, enabled bool) error {
	if options == nil {
		options = json.RawMessage("{}")
	}
	_, err := db.Pool.Exec(ctx,
		`UPDATE monitors SET name = $2, target = $3, interval_sec = $4, options = $5, enabled = $6
		 WHERE id = $1`,
		id, name, target, intervalSec, []byte(options), enabled,
	)
	if err != nil {
		return fmt.Errorf("UpdateMonitor: %w", err)
	}
	return nil
}

func UpdateMonitorStatus(ctx context.Context, db *database.DB, id, lastStatus string, lastCheckedAt *time.Time) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE monitors SET last_status = $2, last_checked_at = $3 WHERE id = $1`,
		id, lastStatus, lastCheckedAt,
	)
	if err != nil {
		return fmt.Errorf("UpdateMonitorStatus: %w", err)
	}
	return nil
}

func DeleteMonitor(ctx context.Context, db *database.DB, id string) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM monitors WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("DeleteMonitor: %w", err)
	}
	return nil
}

func ListMonitors(ctx context.Context, db *database.DB, limit, offset int) ([]Monitor, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, name, type, target, interval_sec, options, enabled, last_status, last_checked_at, created_at
		 FROM monitors ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("ListMonitors: %w", err)
	}
	defer rows.Close()

	var monitors []Monitor
	for rows.Next() {
		var m Monitor
		if err := rows.Scan(&m.ID, &m.Name, &m.Type, &m.Target, &m.IntervalSec, &m.Options, &m.Enabled, &m.LastStatus, &m.LastCheckedAt, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("ListMonitors scan: %w", err)
		}
		monitors = append(monitors, m)
	}
	return monitors, rows.Err()
}
