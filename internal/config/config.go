package config

import (
	"github.com/caarlos0/env/v11"
)

type Config struct {
	APIPort     int    `env:"API_PORT" envDefault:"8080"`
	DatabaseURL string `env:"DATABASE_URL" envDefault:"postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable"`
	NatsURL     string `env:"NATS_URL" envDefault:"nats://localhost:4222"`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
