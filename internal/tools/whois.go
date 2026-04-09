package tools

import (
	"context"
	"fmt"

	"github.com/likexian/whois"
	whoisparser "github.com/likexian/whois-parser"
)

// WhoisResult holds the parsed WHOIS data for a domain or IP.
type WhoisResult struct {
	Domain     string   `json:"domain"`
	Registrar  string   `json:"registrar"`
	CreatedAt  string   `json:"created_at"`
	ExpiresAt  string   `json:"expires_at"`
	UpdatedAt  string   `json:"updated_at"`
	NameServer []string `json:"name_servers"`
	RawText    string   `json:"raw_text"`
}

// WhoisLookup performs a WHOIS lookup for the given target.
func WhoisLookup(ctx context.Context, target string) (*WhoisResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	// Run the WHOIS query in a goroutine so we can respect context cancellation.
	type whoisResp struct {
		raw string
		err error
	}
	ch := make(chan whoisResp, 1)
	go func() {
		raw, err := whois.Whois(target)
		ch <- whoisResp{raw: raw, err: err}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case resp := <-ch:
		if resp.err != nil {
			return nil, fmt.Errorf("whois query failed: %w", resp.err)
		}

		result := &WhoisResult{
			Domain:  target,
			RawText: resp.raw,
		}

		parsed, err := whoisparser.Parse(resp.raw)
		if err == nil {
			if parsed.Domain != nil {
				result.Domain = parsed.Domain.Domain
				result.CreatedAt = parsed.Domain.CreatedDate
				result.ExpiresAt = parsed.Domain.ExpirationDate
				result.UpdatedAt = parsed.Domain.UpdatedDate
				result.NameServer = parsed.Domain.NameServers
			}
			if parsed.Registrar != nil {
				result.Registrar = parsed.Registrar.Name
			}
		}

		return result, nil
	}
}
