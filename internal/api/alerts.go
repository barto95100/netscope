package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/barto/netscope/internal/models"
	"github.com/go-chi/chi/v5"
)

type UpdateAlertRequest struct {
	Status string `json:"status"`
}

// ListAlerts handles GET /api/alerts with optional query params: status, severity.
func (s *Server) ListAlerts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	severity := q.Get("severity")

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

	alerts, err := models.ListAlerts(r.Context(), s.DB, status, severity, limit, offset)
	if err != nil {
		http.Error(w, "failed to list alerts", http.StatusInternalServerError)
		return
	}

	if alerts == nil {
		alerts = []models.Alert{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

// UpdateAlert handles PUT /api/alerts/{id}. Only "acknowledged" or "resolved" are accepted.
func (s *Server) UpdateAlert(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req UpdateAlertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Status != "acknowledged" && req.Status != "resolved" {
		http.Error(w, "status must be 'acknowledged' or 'resolved'", http.StatusBadRequest)
		return
	}

	var resolvedAt *time.Time
	if req.Status == "resolved" {
		t := time.Now()
		resolvedAt = &t
	}

	if err := models.UpdateAlertStatus(r.Context(), s.DB, id, req.Status, resolvedAt); err != nil {
		http.Error(w, "failed to update alert", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
