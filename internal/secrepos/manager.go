package secrepos

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type Repo struct {
	Name string
	URL  string
	Dir  string
}

type Manager struct {
	baseDir string
	repos   []Repo
	mu      sync.RWMutex
	ready   bool
}

func NewManager(baseDir string) *Manager {
	return &Manager{
		baseDir: baseDir,
		repos: []Repo{
			{Name: "nuclei-templates", URL: "https://github.com/projectdiscovery/nuclei-templates.git", Dir: "nuclei-templates"},
			{Name: "SecLists", URL: "https://github.com/danielmiessler/SecLists.git", Dir: "SecLists"},
			{Name: "PayloadsAllTheThings", URL: "https://github.com/swisskyrepo/PayloadsAllTheThings.git", Dir: "PayloadsAllTheThings"},
		},
	}
}

func (m *Manager) Init(ctx context.Context) error {
	if err := os.MkdirAll(m.baseDir, 0755); err != nil {
		return fmt.Errorf("failed to create repos dir: %w", err)
	}
	for _, repo := range m.repos {
		repoPath := filepath.Join(m.baseDir, repo.Dir)
		if _, err := os.Stat(filepath.Join(repoPath, ".git")); err != nil {
			log.Printf("secrepos: cloning %s ...", repo.Name)
			cmd := exec.CommandContext(ctx, "git", "clone", "--depth", "1", repo.URL, repoPath)
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err != nil {
				log.Printf("secrepos: failed to clone %s: %v (continuing without it)", repo.Name, err)
				continue
			}
			log.Printf("secrepos: cloned %s", repo.Name)
		} else {
			log.Printf("secrepos: %s already present, pulling updates...", repo.Name)
			m.pull(ctx, repoPath, repo.Name)
		}
	}
	m.mu.Lock()
	m.ready = true
	m.mu.Unlock()
	return nil
}

func (m *Manager) StartAutoUpdate(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.UpdateAll(ctx)
			}
		}
	}()
}

func (m *Manager) UpdateAll(ctx context.Context) {
	for _, repo := range m.repos {
		repoPath := filepath.Join(m.baseDir, repo.Dir)
		m.pull(ctx, repoPath, repo.Name)
	}
}

func (m *Manager) pull(ctx context.Context, repoPath, name string) {
	// Fetch latest (works with both shallow and full clones)
	fetch := exec.CommandContext(ctx, "git", "-C", repoPath, "fetch", "--depth", "1")
	if out, err := fetch.CombinedOutput(); err != nil {
		log.Printf("secrepos: failed to fetch %s: %v (%s)", name, err, string(out))
		return
	}
	// Reset to latest
	reset := exec.CommandContext(ctx, "git", "-C", repoPath, "reset", "--hard", "origin/HEAD")
	if out, err := reset.CombinedOutput(); err != nil {
		log.Printf("secrepos: failed to reset %s: %v (%s)", name, err, string(out))
	} else {
		log.Printf("secrepos: updated %s", name)
	}
}

func (m *Manager) IsReady() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.ready
}

func (m *Manager) Path(repoName string) string {
	return filepath.Join(m.baseDir, repoName)
}

func (m *Manager) NucleiDir() string      { return m.Path("nuclei-templates") }
func (m *Manager) SecListsDir() string     { return m.Path("SecLists") }
func (m *Manager) PayloadsDir() string     { return m.Path("PayloadsAllTheThings") }
