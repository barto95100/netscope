package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/barto/netscope/internal/queue"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// WSHub manages WebSocket connections grouped by scan ID.
type WSHub struct {
	mu          sync.Mutex
	connections map[string]map[*websocket.Conn]bool
}

// NewWSHub creates a new WSHub.
func NewWSHub() *WSHub {
	return &WSHub{
		connections: make(map[string]map[*websocket.Conn]bool),
	}
}

// Register adds a connection to the hub for a given scan ID.
func (h *WSHub) Register(scanID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.connections[scanID] == nil {
		h.connections[scanID] = make(map[*websocket.Conn]bool)
	}
	h.connections[scanID][conn] = true
}

// Unregister removes a connection from the hub.
func (h *WSHub) Unregister(scanID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.connections[scanID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.connections, scanID)
		}
	}
	conn.Close()
}

// Broadcast sends a message to all connections for a given scan ID.
func (h *WSHub) Broadcast(scanID string, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(h.connections[scanID]))
	for c := range h.connections[scanID] {
		conns = append(conns, c)
	}
	h.mu.Unlock()

	for _, c := range conns {
		if err := c.WriteMessage(websocket.TextMessage, data); err != nil {
			h.Unregister(scanID, c)
		}
	}
}

// HandleWebSocket handles GET /api/ws/scans/{id}.
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	scanID := chi.URLParam(r, "id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	s.WSHub.Register(scanID, conn)
	defer s.WSHub.Unregister(scanID, conn)

	// Subscribe to NATS progress for this scan
	sub, err := s.Subscriber.SubscribeScanProgress(scanID, func(progress queue.ScanProgress) {
		s.WSHub.Broadcast(scanID, progress)
	})
	if err != nil {
		log.Printf("websocket NATS subscribe error: %v", err)
		return
	}
	defer sub.Unsubscribe()

	// Read loop — keep connection open until client disconnects
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
