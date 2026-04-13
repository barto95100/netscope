package secrepos

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type PayloadCategory struct {
	Name     string
	Payloads []string
	Source   string
}

var payloadDirMap = map[string]string{
	"sqli":         "SQL Injection",
	"xss":          "XSS Injection",
	"cmdi":         "Command Injection",
	"lfi":          "File Inclusion",
	"ssrf":         "Server Side Request Forgery",
	"ssti":         "Server Side Template Injection",
	"xxe":          "XXE Injection",
	"csrf":         "CSRF Injection",
	"openredirect": "Open Redirect",
	"ldap":         "LDAP Injection",
	"xpath":        "XPath Injection",
	"nosqli":       "NoSQL Injection",
}

func LoadPayloads(payloadsDir string, category string) ([]PayloadCategory, error) {
	dirName, ok := payloadDirMap[strings.ToLower(category)]
	if !ok {
		return nil, fmt.Errorf("unknown payload category: %s", category)
	}

	catDir := filepath.Join(payloadsDir, dirName)
	if _, err := os.Stat(catDir); err != nil {
		return nil, fmt.Errorf("category dir not found: %s", catDir)
	}

	var categories []PayloadCategory

	// Load .txt files from Intruder/ subdirectory
	intruderDir := filepath.Join(catDir, "Intruder")
	if entries, err := os.ReadDir(intruderDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".txt") {
				continue
			}
			payloads, err := loadTextFile(filepath.Join(intruderDir, entry.Name()))
			if err != nil || len(payloads) == 0 {
				continue
			}
			categories = append(categories, PayloadCategory{
				Name:     strings.TrimSuffix(entry.Name(), ".txt"),
				Payloads: payloads,
				Source:   filepath.Join(intruderDir, entry.Name()),
			})
		}
	}

	// Parse code blocks from README.md
	readmePath := filepath.Join(catDir, "README.md")
	if _, err := os.Stat(readmePath); err == nil {
		payloads, err := parseMarkdownPayloads(readmePath)
		if err == nil && len(payloads) > 0 {
			categories = append(categories, PayloadCategory{
				Name:     dirName + " (README)",
				Payloads: payloads,
				Source:   readmePath,
			})
		}
	}

	return categories, nil
}

func LoadAllPayloads(payloadsDir string) map[string][]string {
	result := make(map[string][]string)
	for key := range payloadDirMap {
		cats, err := LoadPayloads(payloadsDir, key)
		if err != nil {
			continue
		}
		var all []string
		for _, cat := range cats {
			all = append(all, cat.Payloads...)
		}
		seen := make(map[string]bool)
		var unique []string
		for _, p := range all {
			if !seen[p] {
				seen[p] = true
				unique = append(unique, p)
			}
		}
		result[key] = unique
	}
	return result
}

func loadTextFile(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			lines = append(lines, line)
		}
	}
	return lines, scanner.Err()
}

var codeBlockRe = regexp.MustCompile("(?s)```[a-z]*\n(.*?)```")

func parseMarkdownPayloads(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	matches := codeBlockRe.FindAllStringSubmatch(string(data), -1)
	var payloads []string
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		for _, line := range strings.Split(m[1], "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") || strings.HasPrefix(line, "$") || strings.HasPrefix(line, ">") || len(line) > 500 {
				continue
			}
			payloads = append(payloads, line)
		}
	}
	return payloads, nil
}
