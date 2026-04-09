package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/barto/netscope/internal/api"
	"github.com/barto/netscope/internal/config"
	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/queue"
)

// testServer creates a Server connected to the real DB and NATS, returns a cleanup function.
func testServer(t *testing.T) (*api.Server, func()) {
	t.Helper()

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	ctx := context.Background()

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("failed to connect to database: %v", err)
	}

	publisher, err := queue.NewPublisher(cfg.NatsURL)
	if err != nil {
		db.Close()
		t.Fatalf("failed to create NATS publisher: %v", err)
	}

	subscriber, err := queue.NewSubscriber(cfg.NatsURL)
	if err != nil {
		db.Close()
		publisher.Close()
		t.Fatalf("failed to create NATS subscriber: %v", err)
	}

	wsHub := api.NewWSHub()

	s := &api.Server{
		DB:         db,
		Publisher:  publisher,
		Subscriber: subscriber,
		WSHub:      wsHub,
	}

	cleanup := func() {
		subscriber.Close()
		publisher.Close()
		db.Close()
	}

	return s, cleanup
}

// TestCreateScanHandler tests that a valid POST /api/scans returns 201.
func TestCreateScanHandler(t *testing.T) {
	s, cleanup := testServer(t)
	defer cleanup()

	router := api.NewRouter(s)

	body := api.CreateScanRequest{
		Type:   "ping",
		Target: "8.8.8.8",
	}
	data, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/scans", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var scan map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&scan); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if scan["id"] == nil || scan["id"] == "" {
		t.Error("expected scan ID in response")
	}
}

// TestCreateScanValidation tests that a shell injection target returns 400.
func TestCreateScanValidation(t *testing.T) {
	s, cleanup := testServer(t)
	defer cleanup()

	router := api.NewRouter(s)

	body := api.CreateScanRequest{
		Type:   "ping",
		Target: "8.8.8.8; rm -rf /",
	}
	data, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/scans", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestListScansHandler tests that GET /api/scans returns 200 with a JSON array.
func TestListScansHandler(t *testing.T) {
	s, cleanup := testServer(t)
	defer cleanup()

	router := api.NewRouter(s)

	req := httptest.NewRequest(http.MethodGet, "/api/scans", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var scans []map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&scans); err != nil {
		t.Fatalf("failed to decode response as array: %v", err)
	}
}
