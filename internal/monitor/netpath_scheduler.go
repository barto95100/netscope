package monitor

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/models"
	"github.com/barto/netscope/internal/tools"
)

// NetPathScheduler periodically traces paths and detects route changes.
type NetPathScheduler struct {
	DB       *database.DB
	interval time.Duration
	mu       sync.Mutex
	running  map[string]bool
}

func NewNetPathScheduler(db *database.DB) *NetPathScheduler {
	return &NetPathScheduler{
		DB:       db,
		interval: 15 * time.Second, // check for due paths every 15s
		running:  make(map[string]bool),
	}
}

func (s *NetPathScheduler) Run(ctx context.Context) {
	log.Println("netpath scheduler: started")
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	s.tick(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("netpath scheduler: stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *NetPathScheduler) tick(ctx context.Context) {
	paths, err := models.ListNetPaths(ctx, s.DB)
	if err != nil {
		log.Printf("netpath scheduler: list error: %v", err)
		return
	}

	now := time.Now()
	for _, np := range paths {
		if !np.Enabled {
			continue
		}

		if np.LastTraceAt != nil {
			next := np.LastTraceAt.Add(time.Duration(np.IntervalSec) * time.Second)
			if now.Before(next) {
				continue
			}
		}

		s.mu.Lock()
		if s.running[np.ID] {
			s.mu.Unlock()
			continue
		}
		s.running[np.ID] = true
		s.mu.Unlock()

		go func(path models.NetPath) {
			defer func() {
				s.mu.Lock()
				delete(s.running, path.ID)
				s.mu.Unlock()
			}()
			s.trace(ctx, path)
		}(np)
	}
}

func (s *NetPathScheduler) trace(ctx context.Context, np models.NetPath) {
	traceCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	target := tools.StripURLScheme(np.Target)

	// Run traceroute
	result, err := tools.Traceroute(traceCtx, target, 30)
	if err != nil {
		log.Printf("netpath trace: %s failed: %v", np.Name, err)
		return
	}

	// Collect IPs for geolocation
	var ips []string
	for _, h := range result.Hops {
		if h.Address != "" {
			ips = append(ips, h.Address)
		}
	}

	// Geolocate
	geo, _ := tools.GeolocateIPs(traceCtx, ips)

	// Build enriched hops
	hops := make([]models.NetPathTraceHop, 0, len(result.Hops))
	for _, h := range result.Hops {
		hop := models.NetPathTraceHop{
			TTL:     h.TTL,
			Address: h.Address,
			Host:    h.Host,
			RTT:     h.RTT,
		}
		if g, ok := geo[h.Address]; ok {
			hop.City = g.City
			hop.Country = g.Country
			hop.ISP = g.ISP
			hop.Lat = g.Lat
			hop.Lon = g.Lon
		}
		hops = append(hops, hop)
	}

	// Compute route hash
	routeHash := models.ComputeRouteHash(hops)
	routeChanged := np.LastRouteHash != nil && *np.LastRouteHash != routeHash

	hopsJSON, _ := json.Marshal(hops)

	_, err = models.CreateNetPathTrace(ctx, s.DB, np.ID, routeHash, routeChanged, hopsJSON, len(hops))
	if err != nil {
		log.Printf("netpath trace: save failed for %s: %v", np.Name, err)
		return
	}

	if routeChanged {
		log.Printf("netpath trace: ROUTE CHANGED for %s (hash %s -> %s)", np.Name, *np.LastRouteHash, routeHash)

		// Create alert for route change
		msg := "Network path to " + np.Target + " has changed"
		models.CreateAlert(ctx, s.DB, nil, nil, "warning", "Route changed: "+np.Name, &msg)
	} else {
		log.Printf("netpath trace: %s OK (%d hops, hash %s)", np.Name, len(hops), routeHash)
	}
}
