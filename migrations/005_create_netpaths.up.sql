CREATE TABLE netpaths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    target VARCHAR(255) NOT NULL,
    interval_sec INTEGER NOT NULL DEFAULT 300,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_trace_at TIMESTAMPTZ,
    last_route_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE netpath_traces (
    id BIGSERIAL PRIMARY KEY,
    netpath_id UUID NOT NULL REFERENCES netpaths(id) ON DELETE CASCADE,
    route_hash VARCHAR(64) NOT NULL,
    route_changed BOOLEAN NOT NULL DEFAULT false,
    hops JSONB NOT NULL,
    hop_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_netpath_traces_netpath_id ON netpath_traces(netpath_id);
CREATE INDEX idx_netpath_traces_created_at ON netpath_traces(created_at DESC);
CREATE INDEX idx_netpath_traces_route_changed ON netpath_traces(netpath_id, route_changed) WHERE route_changed = true;
