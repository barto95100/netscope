package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/barto/netscope/internal/models"
	"github.com/barto/netscope/internal/queue"
	"github.com/barto/netscope/internal/tools"
	"github.com/go-chi/chi/v5"
)

// CreateScanRequest is the JSON body for creating a scan.
type CreateScanRequest struct {
	Type    string          `json:"type"`
	Target  string          `json:"target"`
	Options json.RawMessage `json:"options"`
}

// CreateScan handles POST /api/scans.
func (s *Server) CreateScan(w http.ResponseWriter, r *http.Request) {
	var req CreateScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if err := tools.ValidateScanType(req.Type); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := tools.ValidateTarget(req.Target); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	scan, err := models.CreateScan(r.Context(), s.DB, req.Type, req.Target, req.Options)
	if err != nil {
		http.Error(w, "failed to create scan", http.StatusInternalServerError)
		return
	}

	job := queue.ScanJob{
		ScanID:  scan.ID,
		Type:    scan.Type,
		Target:  scan.Target,
		Options: scan.Options,
	}
	if err := s.Publisher.PublishScanJob(job); err != nil {
		// Log but don't fail — scan is created
		_ = err
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(scan)
}

// GetScan handles GET /api/scans/{id}.
func (s *Server) GetScan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	scan, err := models.GetScan(r.Context(), s.DB, id)
	if err != nil {
		http.Error(w, "scan not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scan)
}

// ListScans handles GET /api/scans with optional query params: type, status, limit, offset.
func (s *Server) ListScans(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scanType := q.Get("type")
	status := q.Get("status")

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

	scans, err := models.ListScans(r.Context(), s.DB, scanType, status, limit, offset)
	if err != nil {
		http.Error(w, "failed to list scans", http.StatusInternalServerError)
		return
	}

	if scans == nil {
		scans = []models.Scan{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scans)
}

// CancelScan handles DELETE /api/scans/{id}.
func (s *Server) CancelScan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := models.UpdateScanStatus(r.Context(), s.DB, id, "cancelled", nil, nil); err != nil {
		http.Error(w, "failed to cancel scan", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
