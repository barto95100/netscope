package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/barto/netscope/internal/tools"
)

type GeolocateRequest struct {
	IPs []string `json:"ips"`
}

// HandleGeolocate handles POST /api/geolocate.
func (s *Server) HandleGeolocate(w http.ResponseWriter, r *http.Request) {
	var req GeolocateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	// Filter and clean IPs
	var ips []string
	for _, ip := range req.IPs {
		ip = strings.TrimSpace(ip)
		if ip != "" && ip != "???" && ip != "*" {
			ips = append(ips, ip)
		}
	}

	result, err := tools.GeolocateIPs(r.Context(), ips)
	if err != nil {
		http.Error(w, "geolocation failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
