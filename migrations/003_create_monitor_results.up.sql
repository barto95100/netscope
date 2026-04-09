CREATE TABLE monitor_results (
    id BIGSERIAL,
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    status VARCHAR(8) NOT NULL,
    latency_ms REAL,
    status_code SMALLINT,
    error TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);

CREATE INDEX idx_monitor_results_monitor_id ON monitor_results(monitor_id);
CREATE INDEX idx_monitor_results_checked_at ON monitor_results(checked_at DESC);

DO $$
DECLARE
    current_start DATE := date_trunc('month', CURRENT_DATE);
    next_start DATE := date_trunc('month', CURRENT_DATE + INTERVAL '1 month');
    after_next DATE := date_trunc('month', CURRENT_DATE + INTERVAL '2 months');
BEGIN
    EXECUTE format(
        'CREATE TABLE monitor_results_%s PARTITION OF monitor_results FOR VALUES FROM (%L) TO (%L)',
        to_char(current_start, 'YYYY_MM'), current_start, next_start
    );
    EXECUTE format(
        'CREATE TABLE monitor_results_%s PARTITION OF monitor_results FOR VALUES FROM (%L) TO (%L)',
        to_char(next_start, 'YYYY_MM'), next_start, after_next
    );
END $$;
