package secrepos

import (
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type ExecuteResult struct {
	TemplateID  string
	Name        string
	Severity    string
	Matched     bool
	MatchedURL  string
	Evidence    string
	Description string
	References  []string
}

func ExecuteTemplate(ctx context.Context, tmpl NucleiTemplate, baseURL string) (*ExecuteResult, error) {
	result := &ExecuteResult{
		TemplateID:  tmpl.ID,
		Name:        tmpl.Info.Name,
		Severity:    tmpl.Info.Severity,
		Description: tmpl.Info.Description,
		References:  tmpl.Info.Reference,
	}

	if len(tmpl.HTTP) == 0 {
		return result, nil
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	for _, httpReq := range tmpl.HTTP {
		for _, pathTmpl := range httpReq.Path {
			if ctx.Err() != nil {
				return result, ctx.Err()
			}

			targetURL := strings.ReplaceAll(pathTmpl, "{{BaseURL}}", baseURL)
			targetURL = strings.ReplaceAll(targetURL, "{{RootURL}}", baseURL)
			host := strings.TrimPrefix(strings.TrimPrefix(baseURL, "https://"), "http://")
			targetURL = strings.ReplaceAll(targetURL, "{{Hostname}}", host)

			method := strings.ToUpper(httpReq.Method)
			if method == "" {
				method = "GET"
			}

			var bodyReader io.Reader
			if httpReq.Body != "" {
				bodyReader = strings.NewReader(httpReq.Body)
			}

			req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
			if err != nil {
				continue
			}
			req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NetScope/1.0)")
			for k, v := range httpReq.Headers {
				req.Header.Set(k, v)
			}

			resp, err := client.Do(req)
			if err != nil {
				continue
			}
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
			resp.Body.Close()

			if checkMatchers(httpReq.Matchers, httpReq.MatchersCondition, resp, string(body)) {
				result.Matched = true
				result.MatchedURL = targetURL
				if len(body) > 300 {
					result.Evidence = string(body[:300]) + "..."
				} else {
					result.Evidence = string(body)
				}
				return result, nil
			}
		}
	}

	return result, nil
}

func checkMatchers(matchers []NucleiMatcher, condition string, resp *http.Response, body string) bool {
	if len(matchers) == 0 {
		return false
	}

	isAnd := strings.ToLower(condition) == "and"
	results := make([]bool, len(matchers))

	for i, m := range matchers {
		matchTarget := body
		if m.Part == "header" {
			var sb strings.Builder
			for k, vals := range resp.Header {
				for _, v := range vals {
					sb.WriteString(k + ": " + v + "\n")
				}
			}
			matchTarget = sb.String()
		}

		matched := false

		switch m.Type {
		case "word", "words":
			if m.Condition == "and" {
				matched = true
				for _, w := range m.Words {
					if !strings.Contains(strings.ToLower(matchTarget), strings.ToLower(w)) {
						matched = false
						break
					}
				}
			} else {
				for _, w := range m.Words {
					if strings.Contains(strings.ToLower(matchTarget), strings.ToLower(w)) {
						matched = true
						break
					}
				}
			}

		case "regex":
			for _, pattern := range m.Regex {
				re, err := regexp.Compile(pattern)
				if err != nil {
					continue
				}
				if re.MatchString(matchTarget) {
					matched = true
					break
				}
			}

		case "status":
			for _, s := range m.Status {
				if resp.StatusCode == s {
					matched = true
					break
				}
			}
		}

		if m.Negative {
			matched = !matched
		}
		results[i] = matched
	}

	if isAnd {
		for _, r := range results {
			if !r {
				return false
			}
		}
		return true
	}

	for _, r := range results {
		if r {
			return true
		}
	}
	return false
}
