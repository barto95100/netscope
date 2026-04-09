package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/barto/netscope/internal/models"
	"github.com/barto/netscope/internal/tools"
	"github.com/go-chi/chi/v5"
)

type CreateNetPathRequest struct {
	Name        string `json:"name"`
	Target      string `json:"target"`
	IntervalSec int    `json:"interval_sec"`
}

func (s *Server) CreateNetPath(w http.ResponseWriter, r *http.Request) {
	var req CreateNetPathRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Target == "" {
		http.Error(w, "name and target required", http.StatusBadRequest)
		return
	}
	if err := tools.ValidateTarget(req.Target); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.IntervalSec < 60 {
		req.IntervalSec = 300
	}

	np, err := models.CreateNetPath(r.Context(), s.DB, req.Name, req.Target, req.IntervalSec)
	if err != nil {
		http.Error(w, "failed to create netpath", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(np)
}

func (s *Server) ListNetPaths(w http.ResponseWriter, r *http.Request) {
	paths, err := models.ListNetPaths(r.Context(), s.DB)
	if err != nil {
		http.Error(w, "failed to list netpaths", http.StatusInternalServerError)
		return
	}
	if paths == nil {
		paths = []models.NetPath{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(paths)
}

func (s *Server) GetNetPath(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	np, err := models.GetNetPath(r.Context(), s.DB, id)
	if err != nil {
		http.Error(w, "netpath not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(np)
}

func (s *Server) DeleteNetPath(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := models.DeleteNetPath(r.Context(), s.DB, id); err != nil {
		http.Error(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) ListNetPathTraces(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	traces, err := models.ListNetPathTraces(r.Context(), s.DB, id, limit)
	if err != nil {
		http.Error(w, "failed to list traces", http.StatusInternalServerError)
		return
	}
	if traces == nil {
		traces = []models.NetPathTrace{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(traces)
}

func (s *Server) GetNetPathRouteChanges(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	changes, err := models.GetRouteChanges(r.Context(), s.DB, id, limit)
	if err != nil {
		http.Error(w, "failed to get route changes", http.StatusInternalServerError)
		return
	}
	if changes == nil {
		changes = []models.NetPathTrace{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(changes)
}
