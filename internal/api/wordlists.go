package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/barto/netscope/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const wordlistDir = "data/wordlists"
const maxWordlistSize = 10 << 20 // 10MB

func (s *Server) UploadWordlist(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxWordlistSize)

	if err := r.ParseMultipartForm(maxWordlistSize); err != nil {
		http.Error(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	name := r.FormValue("name")
	wlType := r.FormValue("type")
	if name == "" || wlType == "" {
		http.Error(w, "name and type are required", http.StatusBadRequest)
		return
	}
	if wlType != "username" && wlType != "password" && wlType != "combo" {
		http.Error(w, "type must be username, password, or combo", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if err := os.MkdirAll(wordlistDir, 0755); err != nil {
		log.Printf("wordlists: failed to create directory: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	filename := uuid.New().String() + ".txt"
	filePath := filepath.Join(wordlistDir, filename)

	dst, err := os.Create(filePath)
	if err != nil {
		log.Printf("wordlists: failed to create file: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(filePath)
		http.Error(w, "failed to save file", http.StatusInternalServerError)
		return
	}

	// Count lines
	dst.Seek(0, 0)
	scanner := bufio.NewScanner(dst)
	count := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			count++
		}
	}

	wl, err := models.CreateWordlist(r.Context(), s.DB, name, wlType, filePath, count)
	if err != nil {
		os.Remove(filePath)
		log.Printf("wordlists: failed to save to DB: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(wl)
}

func (s *Server) ListWordlists(w http.ResponseWriter, r *http.Request) {
	wls, err := models.ListWordlists(r.Context(), s.DB)
	if err != nil {
		log.Printf("wordlists: failed to list: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if wls == nil {
		wls = []models.Wordlist{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(wls)
}

func (s *Server) DeleteWordlist(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	wl, err := models.GetWordlist(r.Context(), s.DB, id)
	if err != nil {
		http.Error(w, fmt.Sprintf("wordlist not found: %s", id), http.StatusNotFound)
		return
	}

	os.Remove(wl.FilePath)

	if err := models.DeleteWordlist(r.Context(), s.DB, id); err != nil {
		log.Printf("wordlists: failed to delete: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
