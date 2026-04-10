# Docker Packaging + Logo — Design Spec

## Goal

Package NetScope for easy self-hosted deployment via `docker compose up -d`, add a proper logo/favicon, abstract the message queue behind an interface, and add a health check endpoint.

## 1. Logo / Favicon

SVG minimaliste: globe with connected nodes, monochrome, theme-adaptive.

- `frontend/public/logo.svg` — logo for navbar (larger, with text)
- `frontend/public/favicon.svg` — browser favicon (icon only)
- `frontend/index.html` — updated to reference `favicon.svg`

The SVG uses `currentColor` so it adapts to light/dark themes automatically.

## 2. Interface JobQueue

Abstract API↔Worker communication to decouple from NATS.

### `internal/queue/interface.go`

```go
type JobQueue interface {
    PublishJob(job ScanJob) error
    SubscribeJobs(handler func(ScanJob)) error
    PublishProgress(progress ScanProgress) error
    SubscribeProgress(scanID string, handler func(ScanProgress)) (Subscription, error)
    Close()
}

type Subscription interface {
    Unsubscribe() error
}
```

### Refactor existing code

- `internal/queue/publisher.go` + `internal/queue/subscriber.go` → refactor into `internal/queue/nats.go` implementing `JobQueue`
- The existing `Publisher` and `Subscriber` structs merge into a single `NATSQueue` struct
- All call sites (`cmd/api/main.go`, `cmd/worker/main.go`, `internal/api/server.go`, `internal/api/websocket.go`) updated to use the interface

## 3. Health Check Endpoint

### `internal/api/health.go`

`GET /api/health` returns:
```json
{"status": "ok", "db": "connected", "nats": "connected", "version": "1.0.0"}
```

Checks:
- DB: `db.Pool.Ping(ctx)`
- NATS: queue connection status

Used by Docker healthcheck to determine container readiness.

## 4. Static File Serving

The API serves the built frontend files. In `cmd/api/main.go`:

- Look for frontend files in `./frontend/dist` (Docker mount) or embedded via `go:embed` (future binary mode)
- Register a catch-all handler after API routes: any request not matching `/api/*` serves static files or falls back to `index.html` (SPA routing)
- This replaces the need for Nginx

Implementation in `internal/api/static.go`:
```go
func StaticHandler(distDir string) http.Handler {
    fs := http.FileServer(http.Dir(distDir))
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // If file exists, serve it. Otherwise serve index.html for SPA routing.
        path := filepath.Join(distDir, r.URL.Path)
        if _, err := os.Stat(path); err == nil {
            fs.ServeHTTP(w, r)
            return
        }
        http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
    })
}
```

Registered in the router as a catch-all after all API routes.

## 5. Dockerfiles

### `Dockerfile` (API + Frontend)

Multi-stage:
1. **Node stage**: `npm ci && npm run build` in `frontend/`
2. **Go stage**: copy frontend dist, compile API binary
3. **Runtime stage**: Alpine with binary + migrations + frontend dist

The binary serves both the API and the static frontend files.

### `Dockerfile.worker`

Multi-stage:
1. **Go stage**: compile worker binary
2. **Runtime stage**: Alpine with binary

Worker needs no frontend files — it only processes jobs.

## 6. docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: netscope
      POSTGRES_USER: netscope
      POSTGRES_PASSWORD: netscope
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U netscope"]
      interval: 5s
      retries: 5

  nats:
    image: nats:2.10-alpine
    command: ["--jetstream"]

  api:
    build: .
    ports: ["8080:8080"]
    depends_on:
      postgres: { condition: service_healthy }
      nats: { condition: service_started }
    environment:
      API_PORT: "8080"
      DATABASE_URL: postgres://netscope:netscope@postgres:5432/netscope?sslmode=disable
      NATS_URL: nats://nats:4222
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/api/health"]
      interval: 10s
      retries: 3

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    depends_on:
      postgres: { condition: service_healthy }
      nats: { condition: service_started }
    environment:
      DATABASE_URL: postgres://netscope:netscope@postgres:5432/netscope?sslmode=disable
      NATS_URL: nats://nats:4222

volumes:
  pgdata:
```

The existing `docker-compose.deps.yml` remains for development (running API/worker locally with `make api` / `make worker`).

## 7. Supporting Files

### `.dockerignore`

```
node_modules
frontend/node_modules
frontend/dist
.git
*.md
docs/
cmd/scantest/
data/
```

### `.env.example`

```
API_PORT=8080
DATABASE_URL=postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable
NATS_URL=nats://localhost:4222
```

## 8. Migration on Startup

The API container runs migrations automatically on startup before starting the HTTP server. This is done in `cmd/api/main.go` using the golang-migrate library programmatically, replacing the manual `make migrate-up` step.

## Files Summary

### New
- `frontend/public/logo.svg`
- `frontend/public/favicon.svg`
- `internal/queue/interface.go`
- `internal/queue/nats.go` (refactored from publisher.go + subscriber.go)
- `internal/api/health.go`
- `internal/api/static.go`
- `Dockerfile`
- `Dockerfile.worker`
- `docker-compose.yml`
- `.dockerignore`
- `.env.example`

### Modified
- `frontend/index.html` — favicon reference
- `internal/api/router.go` — health route + static catch-all
- `internal/api/server.go` — Server struct uses JobQueue interface
- `internal/api/websocket.go` — uses JobQueue interface
- `cmd/api/main.go` — static file serving + auto-migration
- `cmd/worker/main.go` — uses JobQueue interface

### Deleted
- `internal/queue/publisher.go` (merged into nats.go)
- `internal/queue/subscriber.go` (merged into nats.go)
