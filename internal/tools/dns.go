package tools

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/miekg/dns"
)

// DNSRecord represents a single DNS resource record.
type DNSRecord struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Value string `json:"value"`
	TTL   uint32 `json:"ttl"`
}

// DNSResult holds the DNS lookup results.
type DNSResult struct {
	Target  string      `json:"target"`
	Server  string      `json:"server"`
	Records []DNSRecord `json:"records"`
	QueryMs float64     `json:"query_ms"`
}

var allDNSTypes = []string{"A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"}

var dnsTypeMap = map[string]uint16{
	"A":     dns.TypeA,
	"AAAA":  dns.TypeAAAA,
	"MX":    dns.TypeMX,
	"NS":    dns.TypeNS,
	"TXT":   dns.TypeTXT,
	"CNAME": dns.TypeCNAME,
	"SOA":   dns.TypeSOA,
}

// systemResolver reads the first nameserver from /etc/resolv.conf.
func systemResolver() string {
	f, err := os.Open("/etc/resolv.conf")
	if err != nil {
		return "8.8.8.8:53"
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "nameserver") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				ns := parts[1]
				if !strings.Contains(ns, ":") {
					ns = ns + ":53"
				}
				return ns
			}
		}
	}
	return "8.8.8.8:53"
}

// DNSLookup queries DNS records for the target.
// types specifies which record types to query; if empty, all supported types are queried.
func DNSLookup(ctx context.Context, target string, types []string) (*DNSResult, error) {
	if err := ValidateTarget(target); err != nil {
		return nil, fmt.Errorf("invalid target: %w", err)
	}

	if len(types) == 0 {
		types = allDNSTypes
	}

	// Ensure FQDN
	fqdn := dns.Fqdn(target)
	server := systemResolver()

	client := &dns.Client{Timeout: 10 * time.Second}
	result := &DNSResult{
		Target:  target,
		Server:  server,
		Records: []DNSRecord{},
	}

	start := time.Now()

	for _, t := range types {
		qtype, ok := dnsTypeMap[strings.ToUpper(t)]
		if !ok {
			continue
		}

		msg := new(dns.Msg)
		msg.SetQuestion(fqdn, qtype)
		msg.RecursionDesired = true

		resp, _, err := client.ExchangeContext(ctx, msg, server)
		if err != nil {
			// Try fallback
			client2 := &dns.Client{Timeout: 10 * time.Second}
			resp, _, err = client2.ExchangeContext(ctx, msg, "8.8.8.8:53")
			if err != nil {
				continue
			}
		}

		for _, rr := range resp.Answer {
			rec := parseRR(rr)
			if rec != nil {
				result.Records = append(result.Records, *rec)
			}
		}
	}

	result.QueryMs = float64(time.Since(start).Milliseconds())
	return result, nil
}

func parseRR(rr dns.RR) *DNSRecord {
	hdr := rr.Header()
	rec := &DNSRecord{
		Type: dns.TypeToString[hdr.Rrtype],
		Name: hdr.Name,
		TTL:  hdr.Ttl,
	}

	switch v := rr.(type) {
	case *dns.A:
		rec.Value = v.A.String()
	case *dns.AAAA:
		rec.Value = v.AAAA.String()
	case *dns.MX:
		rec.Value = fmt.Sprintf("%d %s", v.Preference, v.Mx)
	case *dns.NS:
		rec.Value = v.Ns
	case *dns.TXT:
		rec.Value = strings.Join(v.Txt, " ")
	case *dns.CNAME:
		rec.Value = v.Target
	case *dns.SOA:
		rec.Value = fmt.Sprintf("%s %s %d %d %d %d %d", v.Ns, v.Mbox, v.Serial, v.Refresh, v.Retry, v.Expire, v.Minttl)
	default:
		return nil
	}

	return rec
}
