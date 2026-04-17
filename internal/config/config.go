package config

import (
	"github.com/caarlos0/env/v11"
)

type Config struct {
	APIPort     int    `env:"API_PORT" envDefault:"8080"`
	DatabaseURL string `env:"DATABASE_URL" envDefault:"postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable"`
	NatsURL     string `env:"NATS_URL" envDefault:"nats://localhost:4222"`
	StaticDir   string `env:"STATIC_DIR" envDefault:""`
	ReposDir    string `env:"REPOS_DIR" envDefault:"data/repos"`
	OUIDir      string `env:"OUI_DIR" envDefault:"data/oui"`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
