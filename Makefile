.PHONY: deps deps-down api worker migrate-up migrate-down test frontend-install frontend-build frontend-dev

deps:
	docker compose -f docker-compose.deps.yml up -d

deps-down:
	docker compose -f docker-compose.deps.yml down

api:
	go run ./cmd/api

worker:
	go run ./cmd/worker

migrate-up:
	go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest \
		-path migrations -database "postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable" up

migrate-down:
	go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest \
		-path migrations -database "postgres://netscope:netscope@localhost:5432/netscope?sslmode=disable" down 1

test:
	go test ./... -v -count=1

frontend-install:
	cd frontend && npm install

frontend-build:
	cd frontend && npm run build

frontend-dev:
	cd frontend && npm run dev
