package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"time"

	"github.com/barto/netscope/internal/config"
	"github.com/barto/netscope/internal/database"
	"github.com/barto/netscope/internal/monitor"
	"github.com/barto/netscope/internal/queue"
	"github.com/barto/netscope/internal/secrepos"
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

	// Connect to NATS
	q, err := queue.NewNATSQueue(cfg.NatsURL)
	if err != nil {
		log.Fatalf("worker: failed to connect to NATS: %v", err)
	}
	defer q.Close()
	log.Println("worker: connected to NATS")

	// Initialize security repos
	repoMgr := secrepos.NewManager(cfg.ReposDir)
	go func() {
		if err := repoMgr.Init(ctx); err != nil {
			log.Printf("worker: security repos init failed: %v", err)
		}
		repoMgr.StartAutoUpdate(ctx, 24*time.Hour)
	}()

	// Create dispatcher
	dispatcher := &worker.Dispatcher{
		DB:      db,
		Queue:   q,
		RepoMgr: repoMgr,
	}

	// Subscribe to scan jobs
	if err := q.SubscribeJobs(func(job queue.ScanJob) {
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

	// Start monitor scheduler
	scheduler := monitor.NewScheduler(db)
	go scheduler.Run(ctx)

	// Start netpath scheduler
	netpathScheduler := monitor.NewNetPathScheduler(db)
	go netpathScheduler.Run(ctx)

	// Block until shutdown signal
	<-ctx.Done()
	log.Println("worker: shutting down")
}
