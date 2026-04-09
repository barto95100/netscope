package api

import (
	"encoding/json"
	"net/http"
)

// DashboardStats holds aggregated statistics for the dashboard.
type DashboardStats struct {
	MonitoredHosts int `json:"monitored_hosts"`
	ScansToday     int `json:"scans_today"`
	RunningScans   int `json:"running_scans"`
	ActiveAlerts   int `json:"active_alerts"`
	CriticalAlerts int `json:"critical_alerts"`
}

// GetDashboardStats handles GET /api/dashboard/stats.
func (s *Server) GetDashboardStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var stats DashboardStats

	// Monitored hosts: count of enabled monitors
	err := s.DB.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM monitors WHERE enabled = true`).
		Scan(&stats.MonitoredHosts)
	if err != nil {
		http.Error(w, "failed to query monitored hosts", http.StatusInternalServerError)
		return
	}

	// Scans today
	err = s.DB.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM scans WHERE created_at >= CURRENT_DATE`).
		Scan(&stats.ScansToday)
	if err != nil {
		http.Error(w, "failed to query scans today", http.StatusInternalServerError)
		return
	}

	// Running scans
	err = s.DB.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM scans WHERE status = 'running'`).
		Scan(&stats.RunningScans)
	if err != nil {
		http.Error(w, "failed to query running scans", http.StatusInternalServerError)
		return
	}

	// Active alerts (status = 'open' or 'acknowledged')
	err = s.DB.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM alerts WHERE status IN ('open', 'acknowledged')`).
		Scan(&stats.ActiveAlerts)
	if err != nil {
		http.Error(w, "failed to query active alerts", http.StatusInternalServerError)
		return
	}

	// Critical alerts
	err = s.DB.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM alerts WHERE severity = 'critical' AND status IN ('open', 'acknowledged')`).
		Scan(&stats.CriticalAlerts)
	if err != nil {
		http.Error(w, "failed to query critical alerts", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
