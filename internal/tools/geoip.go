package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// GeoLocation holds geolocation data for an IP address.
type GeoLocation struct {
	IP      string  `json:"ip"`
	Country string  `json:"country"`
	City    string  `json:"city"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
	ISP     string  `json:"isp"`
}

// ipAPIResponse matches the ip-api.com JSON response.
type ipAPIResponse struct {
	Status  string  `json:"status"`
	Country string  `json:"country"`
	City    string  `json:"city"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
	ISP     string  `json:"isp"`
	Query   string  `json:"query"`
}

// GeolocateIPs resolves geolocation for a batch of IPs.
// Uses ip-api.com batch endpoint (max 100 per request, free tier).
func GeolocateIPs(ctx context.Context, ips []string) (map[string]*GeoLocation, error) {
	result := make(map[string]*GeoLocation)
	if len(ips) == 0 {
		return result, nil
	}

	// Filter out private/invalid IPs
	var publicIPs []string
	for _, ip := range ips {
		parsed := net.ParseIP(ip)
		if parsed == nil || isPrivateIP(parsed) {
			continue
		}
		if _, exists := result[ip]; !exists {
			publicIPs = append(publicIPs, ip)
		}
	}

	if len(publicIPs) == 0 {
		return result, nil
	}

	// Batch in groups of 100
	for i := 0; i < len(publicIPs); i += 100 {
		end := i + 100
		if end > len(publicIPs) {
			end = len(publicIPs)
		}
		batch := publicIPs[i:end]

		// Build batch request body
		type batchReq struct {
			Query  string `json:"query"`
			Fields string `json:"fields"`
		}
		requests := make([]batchReq, len(batch))
		for j, ip := range batch {
			requests[j] = batchReq{Query: ip, Fields: "status,country,city,lat,lon,isp,query"}
		}

		body, _ := json.Marshal(requests)
		req, err := http.NewRequestWithContext(ctx, "POST", "http://ip-api.com/batch", strings.NewReader(string(body)))
		if err != nil {
			return result, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return result, fmt.Errorf("geolocate request: %w", err)
		}

		var responses []ipAPIResponse
		json.NewDecoder(resp.Body).Decode(&responses)
		resp.Body.Close()

		for _, r := range responses {
			if r.Status == "success" {
				result[r.Query] = &GeoLocation{
					IP:      r.Query,
					Country: r.Country,
					City:    r.City,
					Lat:     r.Lat,
					Lon:     r.Lon,
					ISP:     r.ISP,
				}
			}
		}
	}

	return result, nil
}

func isPrivateIP(ip net.IP) bool {
	privateRanges := []struct {
		start net.IP
		end   net.IP
	}{
		{net.ParseIP("10.0.0.0"), net.ParseIP("10.255.255.255")},
		{net.ParseIP("172.16.0.0"), net.ParseIP("172.31.255.255")},
		{net.ParseIP("192.168.0.0"), net.ParseIP("192.168.255.255")},
		{net.ParseIP("100.64.0.0"), net.ParseIP("100.127.255.255")},
		{net.ParseIP("127.0.0.0"), net.ParseIP("127.255.255.255")},
	}

	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}

	for _, r := range privateRanges {
		if bytesInRange(ip4, r.start.To4(), r.end.To4()) {
			return true
		}
	}
	return false
}

func bytesInRange(ip, start, end net.IP) bool {
	for i := 0; i < 4; i++ {
		if ip[i] < start[i] {
			return false
		}
		if ip[i] > end[i] {
			return false
		}
	}
	return true
}
