package models

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/barto/netscope/internal/database"
)

type NetPath struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Target        string     `json:"target"`
	IntervalSec   int        `json:"interval_sec"`
	Enabled       bool       `json:"enabled"`
	LastTraceAt   *time.Time `json:"last_trace_at"`
	LastRouteHash *string    `json:"last_route_hash"`
	CreatedAt     time.Time  `json:"created_at"`
}

type NetPathTraceHop struct {
	TTL     int     `json:"ttl"`
	Address string  `json:"address"`
	Host    string  `json:"host,omitempty"`
	RTT     float64 `json:"rtt_ms"`
	Loss    float64 `json:"loss_percent,omitempty"`
	City    string  `json:"city,omitempty"`
	Country string  `json:"country,omitempty"`
	ISP     string  `json:"isp,omitempty"`
	Lat     float64 `json:"lat,omitempty"`
	Lon     float64 `json:"lon,omitempty"`
}

type NetPathTrace struct {
	ID           int64           `json:"id"`
	NetPathID    string          `json:"netpath_id"`
	RouteHash    string          `json:"route_hash"`
	RouteChanged bool            `json:"route_changed"`
	Hops         json.RawMessage `json:"hops"`
	HopCount     int             `json:"hop_count"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ComputeRouteHash creates a hash of the route (ordered IPs) to detect changes.
func ComputeRouteHash(hops []NetPathTraceHop) string {
	var route string
	for _, h := range hops {
		if h.Address != "" {
			route += h.Address + ">"
		} else {
			route += "*>"
		}
	}
	hash := sha256.Sum256([]byte(route))
	return fmt.Sprintf("%x", hash[:8])
}

func CreateNetPath(ctx context.Context, db *database.DB, name, target string, intervalSec int) (*NetPath, error) {
	var np NetPath
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO netpaths (name, target, interval_sec) VALUES ($1, $2, $3)
		 RETURNING id, name, target, interval_sec, enabled, last_trace_at, last_route_hash, created_at`,
		name, target, intervalSec,
	).Scan(&np.ID, &np.Name, &np.Target, &np.IntervalSec, &np.Enabled, &np.LastTraceAt, &np.LastRouteHash, &np.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateNetPath: %w", err)
	}
	return &np, nil
}

func ListNetPaths(ctx context.Context, db *database.DB) ([]NetPath, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, name, target, interval_sec, enabled, last_trace_at, last_route_hash, created_at
		 FROM netpaths ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("ListNetPaths: %w", err)
	}
	defer rows.Close()

	var paths []NetPath
	for rows.Next() {
		var np NetPath
		if err := rows.Scan(&np.ID, &np.Name, &np.Target, &np.IntervalSec, &np.Enabled, &np.LastTraceAt, &np.LastRouteHash, &np.CreatedAt); err != nil {
			return nil, err
		}
		paths = append(paths, np)
	}
	return paths, rows.Err()
}

func GetNetPath(ctx context.Context, db *database.DB, id string) (*NetPath, error) {
	var np NetPath
	err := db.Pool.QueryRow(ctx,
		`SELECT id, name, target, interval_sec, enabled, last_trace_at, last_route_hash, created_at
		 FROM netpaths WHERE id = $1`, id,
	).Scan(&np.ID, &np.Name, &np.Target, &np.IntervalSec, &np.Enabled, &np.LastTraceAt, &np.LastRouteHash, &np.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("GetNetPath: %w", err)
	}
	return &np, nil
}

func DeleteNetPath(ctx context.Context, db *database.DB, id string) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM netpaths WHERE id = $1`, id)
	return err
}

func CreateNetPathTrace(ctx context.Context, db *database.DB, netpathID, routeHash string, routeChanged bool, hops json.RawMessage, hopCount int) (*NetPathTrace, error) {
	var t NetPathTrace
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO netpath_traces (netpath_id, route_hash, route_changed, hops, hop_count)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, netpath_id, route_hash, route_changed, hops, hop_count, created_at`,
		netpathID, routeHash, routeChanged, hops, hopCount,
	).Scan(&t.ID, &t.NetPathID, &t.RouteHash, &t.RouteChanged, &t.Hops, &t.HopCount, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateNetPathTrace: %w", err)
	}

	// Update netpath
	now := time.Now()
	db.Pool.Exec(ctx, `UPDATE netpaths SET last_trace_at = $2, last_route_hash = $3 WHERE id = $1`,
		netpathID, now, routeHash)

	return &t, nil
}

func ListNetPathTraces(ctx context.Context, db *database.DB, netpathID string, limit int) ([]NetPathTrace, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := db.Pool.Query(ctx,
		`SELECT id, netpath_id, route_hash, route_changed, hops, hop_count, created_at
		 FROM netpath_traces WHERE netpath_id = $1 ORDER BY created_at DESC LIMIT $2`,
		netpathID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("ListNetPathTraces: %w", err)
	}
	defer rows.Close()

	var traces []NetPathTrace
	for rows.Next() {
		var t NetPathTrace
		if err := rows.Scan(&t.ID, &t.NetPathID, &t.RouteHash, &t.RouteChanged, &t.Hops, &t.HopCount, &t.CreatedAt); err != nil {
			return nil, err
		}
		traces = append(traces, t)
	}
	return traces, rows.Err()
}

// GetRouteChanges returns only traces where the route changed.
func GetRouteChanges(ctx context.Context, db *database.DB, netpathID string, limit int) ([]NetPathTrace, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := db.Pool.Query(ctx,
		`SELECT id, netpath_id, route_hash, route_changed, hops, hop_count, created_at
		 FROM netpath_traces WHERE netpath_id = $1 AND route_changed = true ORDER BY created_at DESC LIMIT $2`,
		netpathID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetRouteChanges: %w", err)
	}
	defer rows.Close()

	var traces []NetPathTrace
	for rows.Next() {
		var t NetPathTrace
		if err := rows.Scan(&t.ID, &t.NetPathID, &t.RouteHash, &t.RouteChanged, &t.Hops, &t.HopCount, &t.CreatedAt); err != nil {
			return nil, err
		}
		traces = append(traces, t)
	}
	return traces, rows.Err()
}
