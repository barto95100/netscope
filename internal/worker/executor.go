package worker

import (
	"context"
	"encoding/json"
)

// ExecutorResult holds the output of a tool execution.
type ExecutorResult struct {
	Data  json.RawMessage `json:"data,omitempty"`
	Error string          `json:"error,omitempty"`
}

// Executor is the interface that all scan tool executors must implement.
type Executor interface {
	Execute(ctx context.Context, target string, options json.RawMessage) (*ExecutorResult, error)
}
