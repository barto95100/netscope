# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Build Go API binary
FROM golang:1.25-alpine AS backend
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /netscope-api ./cmd/api

# Stage 3: Runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl nmap mtr
WORKDIR /app
COPY --from=backend /netscope-api .
COPY --from=frontend /app/frontend/dist ./frontend/dist
COPY migrations ./migrations

ENV STATIC_DIR=/app/frontend/dist
ENV MIGRATION_DIR=/app/migrations

EXPOSE 8080
ENTRYPOINT ["./netscope-api"]
