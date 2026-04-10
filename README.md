<p align="center">
  <img src="frontend/public/logo.svg" width="64" height="64" alt="NetScope">
</p>

<h1 align="center">NetScope</h1>

<p align="center">
  <strong>Network diagnostics, security scanning & penetration testing platform</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

## Features

### Network Diagnostics
- **Ping** &mdash; ICMP connectivity and latency measurement
- **Traceroute & MTR** &mdash; route analysis with packet loss statistics
- **NetPath** &mdash; visual network path monitoring with route change detection
- **DNS Lookup** &mdash; A, AAAA, MX, NS, TXT, CNAME, SOA record queries
- **WHOIS** &mdash; domain registration and ownership information
- **Port Scanner** &mdash; TCP port scanning with service detection

### Security Auditing
- **Vulnerability Scanner** &mdash; 15-module security audit (sensitive files, CORS, cookies, injection probing, subdomain enumeration, WAF detection, and more)
- **Penetration Testing** &mdash; 6-module offensive testing (login brute-force, parameter fuzzing, path traversal, auth bypass, file upload testing, CVE exploitation)
- **SSL/TLS Audit** &mdash; certificate validation, cipher suite analysis, protocol version checks
- **HTTP Headers** &mdash; security header analysis (HSTS, CSP, X-Frame-Options, etc.)

### Monitoring
- **Host Monitoring** &mdash; continuous uptime and latency monitoring with configurable intervals
- **Certificate Monitoring** &mdash; SSL certificate expiration tracking
- **Alerting** &mdash; real-time alerts for downtime, certificate issues, and security findings

### Platform
- **Real-time progress** &mdash; WebSocket-based live updates during scans
- **Dashboard** &mdash; overview of monitored hosts, active scans, and alerts
- **Scan History** &mdash; searchable log of all past scans and results
- **Custom Wordlists** &mdash; upload your own username/password lists for brute-force testing
- **Dark/Light Theme** &mdash; automatic theme based on system preference

## Quick Start

With Docker:

```bash
git clone https://github.com/barto/netscope.git
cd netscope
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080).

That's it. The database migrations run automatically on first start.

## Installation

### Requirements

- **Docker** &ge; 20.10 and **Docker Compose** &ge; 2.0

### Docker (recommended)

```bash
# Clone the repository
git clone https://github.com/barto/netscope.git
cd netscope

# Build and start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f api
docker compose logs -f worker
```

The application will be available at `http://localhost:8080`.

### From Source (development)

Requirements:
- **Go** &ge; 1.25
- **Node.js** &ge; 20
- **PostgreSQL** 16+
- **NATS** 2.10+

```bash
# Clone
git clone https://github.com/barto/netscope.git
cd netscope

# Start dependencies (PostgreSQL + NATS)
docker compose -f docker-compose.deps.yml up -d

# Run database migrations
make migrate-up

# Install frontend dependencies
make frontend-install

# Start all services (3 terminals)
make api          # API server on :8080
make worker       # Background job worker
make frontend-dev # Vite dev server on :3000
```

In development mode, access the app at `http://localhost:3000` (Vite proxies API calls to `:8080`).

## Configuration

NetScope is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `8080` | HTTP server port |
| `DATABASE_URL` | `postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable` | PostgreSQL connection string |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `STATIC_DIR` | _(empty)_ | Path to frontend build directory. Set automatically in Docker. |
| `MIGRATION_DIR` | `migrations` | Path to migration files directory |

Copy `.env.example` to `.env` and adjust values as needed.

### Docker Compose Customization

To change the exposed port:

```yaml
# docker-compose.yml
services:
  api:
    ports:
      - "3000:8080"  # Access on port 3000 instead of 8080
```

To persist data across rebuilds, the PostgreSQL data is stored in a Docker volume (`pgdata`). To reset the database:

```bash
docker compose down -v  # -v removes volumes
docker compose up -d
```

## Architecture

```
                    +-------------------+
                    |    Browser        |
                    |  (React SPA)      |
                    +--------+----------+
                             |
                             | HTTP / WebSocket
                             |
                    +--------v----------+
                    |    API Server     |
                    |   (Go / chi)     |
                    |                   |
                    |  - REST endpoints |
                    |  - Static files   |
                    |  - WebSocket hub  |
                    +---+----------+----+
                        |          |
                   NATS |          | PostgreSQL
                        |          |
                    +---v---+  +---v--------+
                    | NATS  |  | PostgreSQL |
                    +---+---+  +------------+
                        |
                   NATS |
                        |
                    +---v----------+
                    |   Worker     |
                    |              |
                    | - Scan jobs  |
                    | - Pentest    |
                    | - Monitoring |
                    +--------------+
```

### Components

| Service | Role |
|---------|------|
| **API** | HTTP server, serves the React frontend, handles REST API requests, manages WebSocket connections for real-time progress |
| **Worker** | Processes scan/pentest jobs from the NATS queue, runs monitoring schedulers, publishes progress events |
| **PostgreSQL** | Stores scans, results, monitors, alerts, wordlists |
| **NATS** | Message broker between API and Worker (job dispatch + progress events) |

### Project Structure

```
netscope/
├── cmd/
│   ├── api/            # API server entrypoint
│   └── worker/         # Worker entrypoint
├── frontend/
│   ├── src/
│   │   ├── api/        # API client
│   │   ├── components/ # Reusable UI components
│   │   ├── hooks/      # React hooks
│   │   └── pages/      # Page components
│   └── public/         # Static assets (logo, favicon)
├── internal/
│   ├── api/            # HTTP handlers, router, WebSocket
│   ├── config/         # Environment config
│   ├── database/       # PostgreSQL connection
│   ├── models/         # Data models and queries
│   ├── monitor/        # Monitoring schedulers
│   ├── queue/          # JobQueue interface (NATS implementation)
│   ├── tools/          # Network & security tools
│   └── worker/         # Job dispatcher
├── migrations/         # SQL migration files
├── Dockerfile          # API + frontend multi-stage build
├── Dockerfile.worker   # Worker multi-stage build
└── docker-compose.yml  # Production deployment
```

## Development

### Useful Commands

```bash
# Run all tests
make test

# Build frontend for production
make frontend-build

# Apply database migrations
make migrate-up

# Rollback last migration
make migrate-down
```

### Adding a New Scan Type

1. Create the tool function in `internal/tools/`
2. Add the type to `validScanTypes` in `internal/tools/validate.go`
3. Add the case to the dispatcher switch in `internal/worker/dispatcher.go`
4. Add the frontend page in `frontend/src/pages/`
5. Add the route in `frontend/src/App.tsx`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (DB + NATS status) |
| `POST` | `/api/scans` | Create a new scan |
| `GET` | `/api/scans` | List scans |
| `GET` | `/api/scans/{id}` | Get scan by ID |
| `DELETE` | `/api/scans/{id}` | Cancel a scan |
| `POST` | `/api/monitors` | Create a monitor |
| `GET` | `/api/monitors` | List monitors |
| `PUT` | `/api/monitors/{id}` | Update a monitor |
| `DELETE` | `/api/monitors/{id}` | Delete a monitor |
| `GET` | `/api/alerts` | List alerts |
| `PUT` | `/api/alerts/{id}` | Update alert status |
| `GET` | `/api/dashboard/stats` | Dashboard statistics |
| `POST` | `/api/wordlists` | Upload a wordlist |
| `GET` | `/api/wordlists` | List wordlists |
| `DELETE` | `/api/wordlists/{id}` | Delete a wordlist |
| `WS` | `/api/ws/scans/{id}` | WebSocket for scan progress |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`make test`)
5. Commit (`git commit -m "feat: add my feature"`)
6. Push and open a Pull Request

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code change that neither fixes a bug nor adds a feature
- `docs:` documentation only
- `chore:` maintenance tasks

## License

MIT License. See [LICENSE](LICENSE) for details.

## Disclaimer

NetScope is a security tool intended for **authorized testing only**. Always obtain proper authorization before scanning or testing systems you do not own. The authors are not responsible for any misuse.
