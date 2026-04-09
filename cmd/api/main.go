package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/barto/netscope/internal/api"
	"github.com/barto/netscope/internal/config"
	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/queue"
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

	publisher, err := queue.NewPublisher(cfg.NatsURL)
	if err != nil {
		log.Fatalf("failed to create NATS publisher: %v", err)
	}
	defer publisher.Close()

	subscriber, err := queue.NewSubscriber(cfg.NatsURL)
	if err != nil {
		log.Fatalf("failed to create NATS subscriber: %v", err)
	}
	defer subscriber.Close()

	wsHub := api.NewWSHub()

	server := &api.Server{
		DB:         db,
		Publisher:  publisher,
		Subscriber: subscriber,
		WSHub:      wsHub,
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
