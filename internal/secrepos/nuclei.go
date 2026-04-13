package secrepos

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type NucleiTemplate struct {
	ID   string              `yaml:"id"`
	Info NucleiInfo          `yaml:"info"`
	HTTP []NucleiHTTPRequest `yaml:"http"`
	File string              `yaml:"-"`
}

type NucleiInfo struct {
	Name        string   `yaml:"name"`
	Severity    string   `yaml:"severity"`
	Description string   `yaml:"description"`
	Tags        string   `yaml:"tags"`
	Reference   []string `yaml:"reference"`
}

type NucleiHTTPRequest struct {
	Method            string            `yaml:"method"`
	Path              []string          `yaml:"path"`
	Body              string            `yaml:"body"`
	Headers           map[string]string `yaml:"headers"`
	Matchers          []NucleiMatcher   `yaml:"matchers"`
	MatchersCondition string            `yaml:"matchers-condition"`
}

type NucleiMatcher struct {
	Type      string   `yaml:"type"`
	Words     []string `yaml:"words"`
	Regex     []string `yaml:"regex"`
	Status    []int    `yaml:"status"`
	Part      string   `yaml:"part"`
	Negative  bool     `yaml:"negative"`
	Condition string   `yaml:"condition"`
}

func FindTemplatesByCVE(nucleiDir string, cveID string) ([]NucleiTemplate, error) {
	cveID = strings.ToUpper(cveID)
	var templates []NucleiTemplate

	parts := strings.Split(cveID, "-")
	if len(parts) >= 3 {
		year := parts[1]
		// Try both cases
		for _, id := range []string{cveID, strings.ToLower(cveID)} {
			pattern := filepath.Join(nucleiDir, "http", "cves", year, id+".yaml")
			matches, _ := filepath.Glob(pattern)
			for _, f := range matches {
				t, err := parseNucleiTemplate(f)
				if err != nil {
					continue
				}
				templates = append(templates, t)
			}
		}
	}

	return templates, nil
}

func FindTemplatesByProduct(nucleiDir string, product string) ([]NucleiTemplate, error) {
	product = strings.ToLower(product)
	var templates []NucleiTemplate

	searchDirs := []string{
		filepath.Join(nucleiDir, "http", "cves"),
		filepath.Join(nucleiDir, "http", "vulnerabilities"),
		filepath.Join(nucleiDir, "http", "misconfiguration"),
		filepath.Join(nucleiDir, "http", "exposed-panels"),
	}

	for _, dir := range searchDirs {
		filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".yaml") {
				return nil
			}
			if strings.Contains(strings.ToLower(d.Name()), product) {
				t, err := parseNucleiTemplate(path)
				if err != nil {
					return nil
				}
				templates = append(templates, t)
			}
			return nil
		})
	}

	if len(templates) > 50 {
		templates = templates[:50]
	}

	return templates, nil
}

func parseNucleiTemplate(path string) (NucleiTemplate, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return NucleiTemplate{}, err
	}
	var t NucleiTemplate
	if err := yaml.Unmarshal(data, &t); err != nil {
		return NucleiTemplate{}, fmt.Errorf("parse %s: %w", path, err)
	}
	t.File = path
	return t, nil
}
