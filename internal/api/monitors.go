package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/barto/netscope/internal/models"
	"github.com/go-chi/chi/v5"
)

type CreateMonitorRequest struct {
	Name        string          `json:"name"`
	Type        string          `json:"type"`
	Target      string          `json:"target"`
	IntervalSec int             `json:"interval_sec"`
	Options     json.RawMessage `json:"options"`
}

type UpdateMonitorRequest struct {
	Name        string          `json:"name"`
	Target      string          `json:"target"`
	IntervalSec int             `json:"interval_sec"`
	Options     json.RawMessage `json:"options"`
	Enabled     bool            `json:"enabled"`
}

// CreateMonitor handles POST /api/monitors.
func (s *Server) CreateMonitor(w http.ResponseWriter, r *http.Request) {
	var req CreateMonitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.IntervalSec < 30 {
		http.Error(w, "interval_sec must be at least 30", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Target == "" {
		http.Error(w, "target is required", http.StatusBadRequest)
		return
	}

	monitor, err := models.CreateMonitor(r.Context(), s.DB, req.Name, req.Type, req.Target, req.IntervalSec, req.Options)
	if err != nil {
		http.Error(w, "failed to create monitor", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(monitor)
}

// MonitorWithLatency extends Monitor with the last check latency.
type MonitorWithLatency struct {
	models.Monitor
	LastLatencyMs *float32 `json:"last_latency_ms"`
}

// ListMonitors handles GET /api/monitors.
func (s *Server) ListMonitors(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit := 20
	if l := q.Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			limit = v
		}
	}
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 1
	}

	offset := 0
	if o := q.Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil {
			offset = v
		}
	}

	monitors, err := models.ListMonitors(r.Context(), s.DB, limit, offset)
	if err != nil {
		http.Error(w, "failed to list monitors", http.StatusInternalServerError)
		return
	}

	// Enrich with last latency
	result := make([]MonitorWithLatency, len(monitors))
	for i, m := range monitors {
		result[i] = MonitorWithLatency{Monitor: m}
		results, err := models.ListMonitorResults(r.Context(), s.DB, m.ID, 1, 0)
		if err == nil && len(results) > 0 {
			result[i].LastLatencyMs = results[0].LatencyMs
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// UpdateMonitor handles PUT /api/monitors/{id}.
func (s *Server) UpdateMonitor(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req UpdateMonitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.IntervalSec < 30 {
		http.Error(w, "interval_sec must be at least 30", http.StatusBadRequest)
		return
	}

	if err := models.UpdateMonitor(r.Context(), s.DB, id, req.Name, req.Target, req.IntervalSec, req.Options, req.Enabled); err != nil {
		http.Error(w, "failed to update monitor", http.StatusInternalServerError)
		return
	}

	monitor, err := models.GetMonitor(r.Context(), s.DB, id)
	if err != nil {
		http.Error(w, "monitor not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(monitor)
}

// DeleteMonitor handles DELETE /api/monitors/{id}.
func (s *Server) DeleteMonitor(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := models.DeleteMonitor(r.Context(), s.DB, id); err != nil {
		http.Error(w, "failed to delete monitor", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetMonitorResults handles GET /api/monitors/{id}/results.
func (s *Server) GetMonitorResults(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	q := r.URL.Query()

	limit := 20
	if l := q.Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			limit = v
		}
	}
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 1
	}

	offset := 0
	if o := q.Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil {
			offset = v
		}
	}

	results, err := models.ListMonitorResults(r.Context(), s.DB, id, limit, offset)
	if err != nil {
		http.Error(w, "failed to list monitor results", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []models.MonitorResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
