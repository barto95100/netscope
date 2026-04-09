CREATE TABLE monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    type VARCHAR(16) NOT NULL,
    target VARCHAR(255) NOT NULL,
    interval_sec INTEGER NOT NULL DEFAULT 60,
    options JSONB DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_status VARCHAR(8) NOT NULL DEFAULT 'unknown',
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_monitors_type ON monitors(type);
CREATE INDEX idx_monitors_enabled ON monitors(enabled);
