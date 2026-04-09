package tools

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// HeaderCheck holds the result of checking a single security header.
type HeaderCheck struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Present bool   `json:"present"`
	Rating  string `json:"rating"`
	Note    string `json:"note"`
}

// HeadersResult holds the aggregated HTTP security header audit.
type HeadersResult struct {
	Target  string        `json:"target"`
	Grade   string        `json:"grade"`
	Score   int           `json:"score"`
	Headers []HeaderCheck `json:"headers"`
}

type headerSpec struct {
	name    string
	weight  int // contribution to score when present
	evalFn  func(value string) (rating, note string)
}

var securityHeaders = []headerSpec{
	{
		name:   "Strict-Transport-Security",
		weight: 20,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "HSTS not set"
			}
			lower := strings.ToLower(value)
			if strings.Contains(lower, "max-age=0") {
				return "bad", "max-age=0 disables HSTS"
			}
			if strings.Contains(lower, "includesubdomains") {
				return "good", "includeSubDomains present"
			}
			return "ok", "present but missing includeSubDomains"
		},
	},
	{
		name:   "Content-Security-Policy",
		weight: 20,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "CSP not set"
			}
			if strings.Contains(value, "unsafe-inline") || strings.Contains(value, "unsafe-eval") {
				return "weak", "CSP allows unsafe-inline or unsafe-eval"
			}
			return "good", "CSP present"
		},
	},
	{
		name:   "X-Frame-Options",
		weight: 10,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "clickjacking protection not set"
			}
			upper := strings.ToUpper(value)
			if upper == "DENY" || upper == "SAMEORIGIN" {
				return "good", "clickjacking protection present"
			}
			return "ok", "present with custom value"
		},
	},
	{
		name:   "X-Content-Type-Options",
		weight: 10,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "MIME sniffing protection not set"
			}
			if strings.ToLower(value) == "nosniff" {
				return "good", "nosniff set"
			}
			return "ok", "present with non-standard value"
		},
	},
	{
		name:   "Referrer-Policy",
		weight: 10,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "Referrer-Policy not set"
			}
			safe := map[string]bool{
				"no-referrer":                   true,
				"strict-origin":                 true,
				"strict-origin-when-cross-origin": true,
				"no-referrer-when-downgrade":    true,
				"same-origin":                   true,
			}
			if safe[strings.ToLower(value)] {
				return "good", "safe referrer policy"
			}
			return "ok", "present with permissive policy"
		},
	},
	{
		name:   "Permissions-Policy",
		weight: 10,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "Permissions-Policy not set"
			}
			return "good", "Permissions-Policy present"
		},
	},
	{
		name:   "X-XSS-Protection",
		weight: 10,
		evalFn: func(value string) (string, string) {
			if value == "" {
				return "missing", "X-XSS-Protection not set"
			}
			if value == "0" {
				return "info", "disabled (modern browsers ignore this header)"
			}
			return "ok", "present"
		},
	},
}

// CheckHTTPHeaders fetches the target URL and audits its security headers.
func CheckHTTPHeaders(ctx context.Context, target string) (*HeadersResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	url := target
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		url = "https://" + url
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}
	req.Header.Set("User-Agent", "netscope/1.0 (+https://github.com/barto/netscope)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	result := &HeadersResult{
		Target:  target,
		Headers: make([]HeaderCheck, 0, len(securityHeaders)),
	}

	maxScore := 0
	score := 0

	for _, spec := range securityHeaders {
		maxScore += spec.weight
		value := resp.Header.Get(spec.name)
		rating, note := spec.evalFn(value)
		present := value != ""

		check := HeaderCheck{
			Name:    spec.name,
			Value:   value,
			Present: present,
			Rating:  rating,
			Note:    note,
		}
		result.Headers = append(result.Headers, check)

		if present && rating != "missing" && rating != "bad" && rating != "weak" {
			score += spec.weight
		} else if rating == "weak" {
			score += spec.weight / 2
		}
	}

	// Normalise to 100
	if maxScore > 0 {
		result.Score = int(float64(score) / float64(maxScore) * 100)
	}

	result.Grade = scoreToGrade(result.Score)
	return result, nil
}

func scoreToGrade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 80:
		return "B"
	case score >= 70:
		return "C"
	case score >= 60:
		return "D"
	default:
		return "F"
	}
}
