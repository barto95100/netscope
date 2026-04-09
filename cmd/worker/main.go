package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/barto/netscope/internal/config"
	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/queue"
	"github.com/barto/netscope/internal/worker"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("worker: failed to load config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Connect to the database
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("worker: failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("worker: connected to database")

	// Create publisher
	pub, err := queue.NewPublisher(cfg.NatsURL)
	if err != nil {
		log.Fatalf("worker: failed to create NATS publisher: %v", err)
	}
	defer pub.Close()

	// Create subscriber
	sub, err := queue.NewSubscriber(cfg.NatsURL)
	if err != nil {
		log.Fatalf("worker: failed to create NATS subscriber: %v", err)
	}
	defer sub.Close()

	log.Println("worker: connected to NATS")

	// Create dispatcher
	dispatcher := &worker.Dispatcher{
		DB:        db,
		Publisher: pub,
	}

	// Subscribe to scan jobs
	if err := sub.SubscribeScanJobs(func(job queue.ScanJob) {
		// Each job runs in its own goroutine so the subscriber is never blocked.
		go func(j queue.ScanJob) {
			jobCtx, cancel := context.WithCancel(ctx)
			defer cancel()
			log.Printf("worker: handling scan job %s (type=%s target=%s)", j.ScanID, j.Type, j.Target)
			dispatcher.HandleJob(jobCtx, j)
			log.Printf("worker: finished scan job %s", j.ScanID)
		}(job)
	}); err != nil {
		log.Fatalf("worker: failed to subscribe to scan jobs: %v", err)
	}

	log.Println("worker: listening for scan jobs")

	// Block until shutdown signal
	<-ctx.Done()
	log.Println("worker: shutting down")
}
