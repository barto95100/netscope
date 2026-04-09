package monitor

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/models"
	"github.com/jackc/pgx/v5"
	probing "github.com/prometheus-community/pro-bing"
)

// Scheduler periodically runs monitor checks.
type Scheduler struct {
	DB       *database.DB
	interval time.Duration // how often to look for due checks
	mu       sync.Mutex
	running  map[string]bool // track in-flight checks by monitor ID
}

func NewScheduler(db *database.DB) *Scheduler {
	return &Scheduler{
		DB:       db,
		interval: 10 * time.Second,
		running:  make(map[string]bool),
	}
}

// Run starts the scheduler loop. Blocks until ctx is cancelled.
func (s *Scheduler) Run(ctx context.Context) {
	log.Println("monitor scheduler: started")
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	// Run immediately on start
	s.tick(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("monitor scheduler: stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	monitors, err := models.ListMonitors(ctx, s.DB, 1000, 0)
	if err != nil {
		log.Printf("monitor scheduler: failed to list monitors: %v", err)
		return
	}

	now := time.Now()
	for _, m := range monitors {
		if !m.Enabled {
			continue
		}

		// Check if this monitor is due
		if m.LastCheckedAt != nil {
			nextCheck := m.LastCheckedAt.Add(time.Duration(m.IntervalSec) * time.Second)
			if now.Before(nextCheck) {
				continue
			}
		}

		// Skip if already running
		s.mu.Lock()
		if s.running[m.ID] {
			s.mu.Unlock()
			continue
		}
		s.running[m.ID] = true
		s.mu.Unlock()

		go func(mon models.Monitor) {
			defer func() {
				s.mu.Lock()
				delete(s.running, mon.ID)
				s.mu.Unlock()
			}()
			s.check(ctx, mon)
		}(m)
	}
}

func (s *Scheduler) check(ctx context.Context, m models.Monitor) {
	checkCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var status string
	var latencyMs float32
	var statusCode int16
	var errMsg string

	start := time.Now()

	switch m.Type {
	case "http":
		status, latencyMs, statusCode, errMsg = checkHTTP(checkCtx, m.Target)
	case "tcp":
		status, latencyMs, errMsg = checkTCP(checkCtx, m.Target)
	case "icmp":
		status, latencyMs, errMsg = checkICMP(checkCtx, m.Target)
	case "ssl_expiry":
		status, latencyMs, errMsg = checkSSLExpiry(checkCtx, m.Target)
	default:
		status = "down"
		errMsg = fmt.Sprintf("unknown monitor type: %s", m.Type)
	}

	_ = start // latency is measured inside each check

	// Save result
	var latPtr *float32
	var codePtr *int16
	var errPtr *string
	if latencyMs > 0 {
		latPtr = &latencyMs
	}
	if statusCode > 0 {
		codePtr = &statusCode
	}
	if errMsg != "" {
		errPtr = &errMsg
	}

	_, err := models.CreateMonitorResult(ctx, s.DB, m.ID, status, latPtr, codePtr, errPtr)
	if err != nil {
		log.Printf("monitor scheduler: failed to save result for %s: %v", m.Name, err)
		return
	}

	// Update monitor status
	now := time.Now()
	err = models.UpdateMonitorStatus(ctx, s.DB, m.ID, status, &now)
	if err != nil {
		log.Printf("monitor scheduler: failed to update status for %s: %v", m.Name, err)
	}

	log.Printf("monitor check: %s (%s) -> %s (%.1fms)", m.Name, m.Target, status, latencyMs)

	// Alert logic
	s.handleAlerts(ctx, m, status)
}

const consecutiveFailuresThreshold = 3
const certExpiryWarningDays = 7

func (s *Scheduler) handleAlerts(ctx context.Context, m models.Monitor, status string) {
	existingAlert, err := models.GetActiveAlertForMonitor(ctx, s.DB, m.ID)
	if err != nil && err != pgx.ErrNoRows {
		log.Printf("monitor alerts: failed to get active alert for %s: %v", m.Name, err)
		return
	}

	if status == "down" {
		// Count consecutive failures
		failures, err := models.CountRecentFailures(ctx, s.DB, m.ID, consecutiveFailuresThreshold)
		if err != nil {
			log.Printf("monitor alerts: failed to count failures for %s: %v", m.Name, err)
			return
		}

		if failures >= consecutiveFailuresThreshold && existingAlert == nil {
			// Create CRITICAL alert
			msg := fmt.Sprintf("%s (%s) has been down for %d consecutive checks", m.Name, m.Target, failures)
			title := fmt.Sprintf("%s is DOWN", m.Name)
			_, err := models.CreateAlert(ctx, s.DB, &m.ID, nil, "critical", title, &msg)
			if err != nil {
				log.Printf("monitor alerts: failed to create alert for %s: %v", m.Name, err)
			} else {
				log.Printf("monitor alerts: CRITICAL alert created for %s", m.Name)
			}
		}
	} else if status == "up" && existingAlert != nil {
		// Auto-resolve
		now := time.Now()
		err := models.UpdateAlertStatus(ctx, s.DB, existingAlert.ID, "resolved", &now)
		if err != nil {
			log.Printf("monitor alerts: failed to resolve alert for %s: %v", m.Name, err)
		} else {
			log.Printf("monitor alerts: auto-resolved alert for %s", m.Name)
		}
	}

	// SSL expiry warning (for ssl_expiry monitors only)
	if m.Type == "ssl_expiry" && status == "up" {
		s.checkCertExpiryWarning(ctx, m)
	}
}

func (s *Scheduler) checkCertExpiryWarning(ctx context.Context, m models.Monitor) {
	host := m.Target
	port := "443"
	if h, p, err := net.SplitHostPort(m.Target); err == nil {
		host, port = h, p
	}

	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", net.JoinHostPort(host, port), &tls.Config{
		ServerName: host,
	})
	if err != nil {
		return
	}
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return
	}

	daysLeft := int(time.Until(certs[0].NotAfter).Hours() / 24)
	if daysLeft > certExpiryWarningDays {
		return
	}

	// Check if we already have a warning for this
	existing, err := models.GetActiveAlertForMonitor(ctx, s.DB, m.ID)
	if err != nil && err != pgx.ErrNoRows {
		return
	}
	if existing != nil {
		return // already have an alert
	}

	title := fmt.Sprintf("SSL certificate for %s expires in %d days", m.Target, daysLeft)
	msg := fmt.Sprintf("Certificate CN=%s expires on %s", certs[0].Subject.CommonName, certs[0].NotAfter.Format("2006-01-02"))
	severity := "warning"
	if daysLeft <= 0 {
		severity = "critical"
		title = fmt.Sprintf("SSL certificate for %s has EXPIRED", m.Target)
	}

	_, err = models.CreateAlert(ctx, s.DB, &m.ID, nil, severity, title, &msg)
	if err != nil {
		log.Printf("monitor alerts: failed to create cert expiry alert for %s: %v", m.Name, err)
	} else {
		log.Printf("monitor alerts: %s alert created for cert expiry on %s (%d days left)", severity, m.Target, daysLeft)
	}
}

func checkHTTP(ctx context.Context, target string) (status string, latencyMs float32, statusCode int16, errMsg string) {
	client := &http.Client{Timeout: 10 * time.Second}
	start := time.Now()

	req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return "down", 0, 0, fmt.Sprintf("invalid URL: %v", err)
	}
	req.Header.Set("User-Agent", "NetScope/1.0 Monitor")

	resp, err := client.Do(req)
	latencyMs = float32(time.Since(start).Milliseconds())
	if err != nil {
		return "down", latencyMs, 0, fmt.Sprintf("request failed: %v", err)
	}
	defer resp.Body.Close()

	statusCode = int16(resp.StatusCode)
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		return "up", latencyMs, statusCode, ""
	}
	return "down", latencyMs, statusCode, fmt.Sprintf("HTTP %d", resp.StatusCode)
}

func checkTCP(ctx context.Context, target string) (status string, latencyMs float32, errMsg string) {
	start := time.Now()
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", target)
	latencyMs = float32(time.Since(start).Milliseconds())
	if err != nil {
		return "down", latencyMs, fmt.Sprintf("connection failed: %v", err)
	}
	conn.Close()
	return "up", latencyMs, ""
}

func checkICMP(ctx context.Context, target string) (status string, latencyMs float32, errMsg string) {
	pinger, err := probing.NewPinger(target)
	if err != nil {
		return "down", 0, fmt.Sprintf("pinger creation failed: %v", err)
	}
	pinger.Count = 1
	pinger.Timeout = 5 * time.Second
	pinger.SetPrivileged(false)

	if err := pinger.RunWithContext(ctx); err != nil {
		return "down", 0, fmt.Sprintf("ping failed: %v", err)
	}

	stats := pinger.Statistics()
	if stats.PacketsRecv == 0 {
		return "down", 0, "no reply"
	}
	latencyMs = float32(stats.AvgRtt.Milliseconds())
	return "up", latencyMs, ""
}

func checkSSLExpiry(ctx context.Context, target string) (status string, latencyMs float32, errMsg string) {
	host := target
	port := "443"
	if h, p, err := net.SplitHostPort(target); err == nil {
		host, port = h, p
	}

	start := time.Now()
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(host, port), &tls.Config{
		ServerName: host,
	})
	latencyMs = float32(time.Since(start).Milliseconds())
	if err != nil {
		return "down", latencyMs, fmt.Sprintf("TLS connect failed: %v", err)
	}
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return "down", latencyMs, "no certificates"
	}

	daysLeft := int(time.Until(certs[0].NotAfter).Hours() / 24)
	if daysLeft <= 0 {
		return "down", latencyMs, fmt.Sprintf("certificate expired %d days ago", -daysLeft)
	}
	if daysLeft <= 14 {
		return "down", latencyMs, fmt.Sprintf("certificate expires in %d days", daysLeft)
	}
	return "up", latencyMs, ""
}
