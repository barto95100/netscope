package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/barto/netscope/internal/api"
	"github.com/barto/netscope/internal/config"
	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/queue"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx := context.Background()

	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run migrations
	log.Println("running database migrations...")
	migrationDir := "file://migrations"
	if dir := os.Getenv("MIGRATION_DIR"); dir != "" {
		migrationDir = "file://" + dir
	}
	migrateDBURL := strings.Replace(cfg.DatabaseURL, "postgres://", "pgx5://", 1)
	m, err := migrate.New(migrationDir, migrateDBURL)
	if err != nil {
		log.Printf("migration setup: %v (skipping)", err)
	} else {
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("migration failed: %v", err)
		}
		srcErr, dbErr := m.Close()
		if srcErr != nil {
			log.Printf("migration source close: %v", srcErr)
		}
		if dbErr != nil {
			log.Printf("migration db close: %v", dbErr)
		}
		log.Println("migrations complete")
	}

	q, err := queue.NewNATSQueue(cfg.NatsURL)
	if err != nil {
		log.Fatalf("failed to connect to NATS: %v", err)
	}
	defer q.Close()
	log.Println("connected to NATS")

	wsHub := api.NewWSHub()

	server := &api.Server{
		DB:        db,
		Queue:     q,
		WSHub:     wsHub,
		StaticDir: cfg.StaticDir,
	}

	router := api.NewRouter(server)

	addr := fmt.Sprintf(":%d", cfg.APIPort)
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in background
	go func() {
		log.Printf("NetScope API server listening on %s", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
	log.Println("server stopped")
}
