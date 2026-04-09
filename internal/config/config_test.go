package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.APIPort != 8080 {
		t.Errorf("expected APIPort 8080, got %d", cfg.APIPort)
	}
	if cfg.DatabaseURL != "postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable" {
		t.Errorf("unexpected DatabaseURL: %s", cfg.DatabaseURL)
	}
	if cfg.NatsURL != "nats://localhost:4222" {
		t.Errorf("unexpected NatsURL: %s", cfg.NatsURL)
	}
}

func TestLoadFromEnv(t *testing.T) {
	os.Setenv("API_PORT", "9090")
	os.Setenv("DATABASE_URL", "postgres://custom:custom@db:5432/custom?sslmode=disable")
	defer os.Unsetenv("API_PORT")
	defer os.Unsetenv("DATABASE_URL")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.APIPort != 9090 {
		t.Errorf("expected APIPort 9090, got %d", cfg.APIPort)
	}
	if cfg.DatabaseURL != "postgres://custom:custom@db:5432/custom?sslmode=disable" {
		t.Errorf("unexpected DatabaseURL: %s", cfg.DatabaseURL)
	}
}
