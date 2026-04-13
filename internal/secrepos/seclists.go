package secrepos

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

var SecListsFiles = map[string][]string{
	"passwords_top1000": {
		"Passwords/Common-Credentials/10-million-password-list-top-1000.txt",
	},
	"passwords_top10000": {
		"Passwords/Common-Credentials/10-million-password-list-top-10000.txt",
	},
	"usernames_top": {
		"Usernames/top-usernames-shortlist.txt",
	},
	"usernames_names": {
		"Usernames/Names/names.txt",
	},
	"web_common": {
		"Discovery/Web-Content/common.txt",
	},
	"web_directories": {
		"Discovery/Web-Content/directory-list-2.3-small.txt",
	},
	"web_sensitive": {
		"Discovery/Web-Content/quickhits.txt",
	},
	"fuzzing_lfi": {
		"Fuzzing/LFI/LFI-Jhaddix.txt",
	},
	"fuzzing_sqli": {
		"Fuzzing/SQLi/Generic-SQLi.txt",
	},
	"fuzzing_xss": {
		"Fuzzing/XSS/XSS-Jhaddix.txt",
	},
}

func LoadSecList(seclistsDir string, key string) ([]string, error) {
	files, ok := SecListsFiles[key]
	if !ok {
		return nil, nil
	}
	var allEntries []string
	for _, relPath := range files {
		fullPath := filepath.Join(seclistsDir, relPath)
		entries, err := loadTextFileSecLists(fullPath)
		if err != nil {
			continue
		}
		allEntries = append(allEntries, entries...)
	}
	return allEntries, nil
}

func LoadSecListPasswords(seclistsDir string, size string) []string {
	var key string
	switch size {
	case "large":
		key = "passwords_top10000"
	default:
		key = "passwords_top1000"
	}
	entries, err := LoadSecList(seclistsDir, key)
	if err != nil || len(entries) == 0 {
		return nil
	}
	return entries
}

func LoadSecListUsernames(seclistsDir string) []string {
	entries, err := LoadSecList(seclistsDir, "usernames_top")
	if err != nil || len(entries) == 0 {
		return nil
	}
	return entries
}

func loadTextFileSecLists(path string) ([]string, error) {
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
