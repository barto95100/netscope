package models

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/barto/netscope/internal/database"
)

type Scan struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Status      string          `json:"status"`
	Target      string          `json:"target"`
	Options     json.RawMessage `json:"options"`
	Result      json.RawMessage `json:"result"`
	Error       *string         `json:"error"`
	StartedAt   *time.Time      `json:"started_at"`
	CompletedAt *time.Time      `json:"completed_at"`
	CreatedAt   time.Time       `json:"created_at"`
}

func CreateScan(ctx context.Context, db *database.DB, scanType, target string, options json.RawMessage) (*Scan, error) {
	if options == nil {
		options = json.RawMessage("{}")
	}
	var s Scan
	row := db.Pool.QueryRow(ctx,
		`INSERT INTO scans (type, target, options)
		 VALUES ($1, $2, $3)
		 RETURNING id, type, status, target, options, result, error, started_at, completed_at, created_at`,
		scanType, target, []byte(options),
	)
	err := row.Scan(&s.ID, &s.Type, &s.Status, &s.Target, &s.Options, &s.Result, &s.Error, &s.StartedAt, &s.CompletedAt, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateScan: %w", err)
	}
	return &s, nil
}

func GetScan(ctx context.Context, db *database.DB, id string) (*Scan, error) {
	var s Scan
	row := db.Pool.QueryRow(ctx,
		`SELECT id, type, status, target, options, result, error, started_at, completed_at, created_at
		 FROM scans WHERE id = $1`,
		id,
	)
	err := row.Scan(&s.ID, &s.Type, &s.Status, &s.Target, &s.Options, &s.Result, &s.Error, &s.StartedAt, &s.CompletedAt, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("GetScan: %w", err)
	}
	return &s, nil
}

func UpdateScanStatus(ctx context.Context, db *database.DB, id, status string, startedAt, completedAt *time.Time) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE scans
		 SET status = $2,
		     started_at = COALESCE($3, started_at),
		     completed_at = COALESCE($4, completed_at)
		 WHERE id = $1`,
		id, status, startedAt, completedAt,
	)
	if err != nil {
		return fmt.Errorf("UpdateScanStatus: %w", err)
	}
	return nil
}

func UpdateScanResult(ctx context.Context, db *database.DB, id string, result json.RawMessage) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE scans SET result = $2 WHERE id = $1`,
		id, []byte(result),
	)
	if err != nil {
		return fmt.Errorf("UpdateScanResult: %w", err)
	}
	return nil
}

func UpdateScanError(ctx context.Context, db *database.DB, id, status, errMsg string, completedAt *time.Time) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE scans
		 SET status = $2, error = $3, completed_at = COALESCE($4, completed_at)
		 WHERE id = $1`,
		id, status, errMsg, completedAt,
	)
	if err != nil {
		return fmt.Errorf("UpdateScanError: %w", err)
	}
	return nil
}

func ListScans(ctx context.Context, db *database.DB, scanType, status string, limit, offset int) ([]Scan, error) {
	args := []interface{}{}
	conds := []string{}
	i := 1

	if scanType != "" {
		conds = append(conds, fmt.Sprintf("type = $%d", i))
		args = append(args, scanType)
		i++
	}
	if status != "" {
		conds = append(conds, fmt.Sprintf("status = $%d", i))
		args = append(args, status)
		i++
	}

	where := ""
	if len(conds) > 0 {
		where = "WHERE " + strings.Join(conds, " AND ")
	}

	args = append(args, limit, offset)
	q := fmt.Sprintf(`SELECT id, type, status, target, options, result, error, started_at, completed_at, created_at
		 FROM scans %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`, where, i, i+1)

	rows, err := db.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("ListScans: %w", err)
	}
	defer rows.Close()

	var scans []Scan
	for rows.Next() {
		var s Scan
		if err := rows.Scan(&s.ID, &s.Type, &s.Status, &s.Target, &s.Options, &s.Result, &s.Error, &s.StartedAt, &s.CompletedAt, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("ListScans scan: %w", err)
		}
		scans = append(scans, s)
	}
	return scans, rows.Err()
}
