package api

import (
	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/queue"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// Server holds all dependencies for API handlers.
type Server struct {
	DB    *database.DB
	Queue queue.JobQueue
	WSHub *WSHub
}

// NewRouter creates and configures a chi router with all API routes.
func NewRouter(s *Server) *chi.Mux {
	r := chi.NewRouter()

	// WebSocket routes - NO middleware that wraps ResponseWriter
	r.Get("/api/ws/scans/{id}", s.HandleWebSocket)
	r.Get("/api/ws/mtr", s.HandleMtrWebSocket)

	// REST API routes - with full middleware stack
	r.Group(func(r chi.Router) {
		r.Use(middleware.Recoverer)
		r.Use(middleware.RealIP)
		r.Use(LoggingMiddleware)
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins: []string{"http://localhost:*", "https://localhost:*"},
			AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
			MaxAge:         300,
		}))

		r.Post("/api/scans", s.CreateScan)
		r.Get("/api/scans", s.ListScans)
		r.Get("/api/scans/{id}", s.GetScan)
		r.Delete("/api/scans/{id}", s.CancelScan)

		r.Post("/api/monitors", s.CreateMonitor)
		r.Get("/api/monitors", s.ListMonitors)
		r.Put("/api/monitors/{id}", s.UpdateMonitor)
		r.Delete("/api/monitors/{id}", s.DeleteMonitor)
		r.Get("/api/monitors/{id}/results", s.GetMonitorResults)

		r.Get("/api/alerts", s.ListAlerts)
		r.Put("/api/alerts/{id}", s.UpdateAlert)

		r.Get("/api/dashboard/stats", s.GetDashboardStats)
		r.Post("/api/geolocate", s.HandleGeolocate)

		r.Post("/api/netpaths", s.CreateNetPath)
		r.Get("/api/netpaths", s.ListNetPaths)
		r.Get("/api/netpaths/{id}", s.GetNetPath)
		r.Delete("/api/netpaths/{id}", s.DeleteNetPath)
		r.Get("/api/netpaths/{id}/traces", s.ListNetPathTraces)
		r.Get("/api/netpaths/{id}/changes", s.GetNetPathRouteChanges)

		r.Post("/api/wordlists", s.UploadWordlist)
		r.Get("/api/wordlists", s.ListWordlists)
		r.Delete("/api/wordlists/{id}", s.DeleteWordlist)

		r.Get("/api/health", s.HandleHealth)
	})

	return r
}
