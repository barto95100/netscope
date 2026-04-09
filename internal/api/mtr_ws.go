package api

import (
	"bufio"
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/barto/netscope/internal/tools"
	"github.com/gorilla/websocket"
)

// MtrHopLive holds accumulated stats for one hop during a live MTR session.
type MtrHopLive struct {
	TTL    int     `json:"ttl"`
	Host   string  `json:"host"`
	Sent   int     `json:"sent"`
	Recv   int     `json:"recv"`
	Loss   float64 `json:"loss_percent"`
	Last   float64 `json:"last_ms"`
	Best   float64 `json:"best_ms"`
	Avg    float64 `json:"avg_ms"`
	Worst  float64 `json:"worst_ms"`
	StdDev float64 `json:"stddev_ms"`
}

// MtrLiveUpdate is sent to the client via WebSocket.
type MtrLiveUpdate struct {
	Type string       `json:"type"` // "update" or "done"
	Hops []MtrHopLive `json:"hops"`
}

// HandleMtrWebSocket handles GET /api/ws/mtr/{target}.
func (s *Server) HandleMtrWebSocket(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("target")

	if err := tools.ValidateTarget(target); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	target = tools.StripURLScheme(target)

	log.Printf("mtr ws: upgrading connection for target=%s", target)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("mtr ws: upgrade error: %v", err)
		return
	}
	defer conn.Close()
	log.Printf("mtr ws: connected, starting mtr for %s", target)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Listen for client disconnect or stop message
	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
			if string(msg) == "stop" {
				log.Printf("mtr ws: stop received for %s", target)
				cancel()
				return
			}
		}
	}()

	mtrPath, err := exec.LookPath("mtr")
	if err != nil {
		log.Printf("mtr ws: mtr binary not found: %v", err)
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"mtr not found on server"}`))
		return
	}
	log.Printf("mtr ws: using mtr at %s", mtrPath)

	cmd := exec.CommandContext(ctx, mtrPath, "--raw", "--no-dns", target)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("mtr ws: pipe error: %v", err)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("mtr ws: start error: %v", err)
		return
	}

	var mu sync.Mutex
	hops := make(map[int]*hopAccum)

	// Send updates every 500ms
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				mu.Lock()
				update := buildMtrUpdate(hops, "update")
				mu.Unlock()
				if len(update.Hops) > 0 {
					data, _ := json.Marshal(update)
					if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
						cancel()
						return
					}
				}
			}
		}
	}()

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		kind := fields[0]
		ttl, err := strconv.Atoi(fields[1])
		if err != nil {
			continue
		}

		mu.Lock()
		if hops[ttl] == nil {
			hops[ttl] = &hopAccum{TTL: ttl}
		}
		h := hops[ttl]

		switch kind {
		case "h":
			h.Host = fields[2]
		case "p":
			usec, _ := strconv.ParseFloat(fields[2], 64)
			h.Pings = append(h.Pings, usec/1000.0)
		case "x":
			h.Sent++
		}
		mu.Unlock()
	}

	// Send final
	mu.Lock()
	final := buildMtrUpdate(hops, "done")
	mu.Unlock()
	data, _ := json.Marshal(final)
	conn.WriteMessage(websocket.TextMessage, data)

	cmd.Wait()
	log.Printf("mtr ws: session ended for %s", target)
}

type hopAccum struct {
	TTL   int
	Host  string
	Sent  int
	Pings []float64
}

func buildMtrUpdate(hops map[int]*hopAccum, msgType string) MtrLiveUpdate {
	update := MtrLiveUpdate{Type: msgType}

	maxTTL := 0
	for ttl := range hops {
		if ttl > maxTTL {
			maxTTL = ttl
		}
	}

	for i := 0; i <= maxTTL; i++ {
		h, ok := hops[i]
		if !ok {
			update.Hops = append(update.Hops, MtrHopLive{TTL: i, Host: "???"})
			continue
		}

		live := MtrHopLive{
			TTL:  h.TTL,
			Host: h.Host,
			Sent: h.Sent,
			Recv: len(h.Pings),
		}
		if live.Host == "" {
			live.Host = "???"
		}
		if h.Sent > 0 {
			live.Loss = float64(h.Sent-len(h.Pings)) / float64(h.Sent) * 100
		}
		if len(h.Pings) > 0 {
			live.Last = h.Pings[len(h.Pings)-1]
			live.Best = h.Pings[0]
			live.Worst = h.Pings[0]
			sum := 0.0
			for _, p := range h.Pings {
				sum += p
				if p < live.Best {
					live.Best = p
				}
				if p > live.Worst {
					live.Worst = p
				}
			}
			live.Avg = sum / float64(len(h.Pings))
			if len(h.Pings) > 1 {
				variance := 0.0
				for _, p := range h.Pings {
					d := p - live.Avg
					variance += d * d
				}
				live.StdDev = math.Sqrt(variance / float64(len(h.Pings)))
			}
		}

		update.Hops = append(update.Hops, live)
	}

	return update
}
