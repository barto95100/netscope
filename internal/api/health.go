package api

import (
	"encoding/json"
	"net/http"

	"github.com/barto/netscope/internal/queue"
)

type healthResponse struct {
	Status  string `json:"status"`
	DB      string `json:"db"`
	Queue   string `json:"queue"`
	Version string `json:"version"`
}

func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
	resp := healthResponse{
		Status:  "ok",
		Version: "1.0.0",
	}

	if err := s.DB.Ping(r.Context()); err != nil {
		resp.Status = "degraded"
		resp.DB = "disconnected"
	} else {
		resp.DB = "connected"
	}

	if nq, ok := s.Queue.(*queue.NATSQueue); ok && nq.IsConnected() {
		resp.Queue = "connected"
	} else {
		resp.Status = "degraded"
		resp.Queue = "disconnected"
	}

	w.Header().Set("Content-Type", "application/json")
	if resp.Status != "ok" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(resp)
}
