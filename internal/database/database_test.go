package database

import (
	"context"
	"os"
	"testing"
)

func TestConnect(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable"
	}

	db, err := Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer db.Close()

	err = db.Ping(context.Background())
	if err != nil {
		t.Fatalf("failed to ping: %v", err)
	}
}
