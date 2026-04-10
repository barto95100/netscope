package models

import (
	"context"
	"time"

	"github.com/barto/netscope/internal/database"
)

type Wordlist struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Type       string    `json:"type"`
	EntryCount int       `json:"entry_count"`
	FilePath   string    `json:"file_path"`
	CreatedAt  time.Time `json:"created_at"`
}

func CreateWordlist(ctx context.Context, db *database.DB, name, wlType, filePath string, entryCount int) (*Wordlist, error) {
	var w Wordlist
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO wordlists (name, type, entry_count, file_path) VALUES ($1, $2, $3, $4)
		 RETURNING id, name, type, entry_count, file_path, created_at`,
		name, wlType, entryCount, filePath,
	).Scan(&w.ID, &w.Name, &w.Type, &w.EntryCount, &w.FilePath, &w.CreatedAt)
	return &w, err
}

func ListWordlists(ctx context.Context, db *database.DB) ([]Wordlist, error) {
	rows, err := db.Pool.Query(ctx, `SELECT id, name, type, entry_count, file_path, created_at FROM wordlists ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var wls []Wordlist
	for rows.Next() {
		var w Wordlist
		if err := rows.Scan(&w.ID, &w.Name, &w.Type, &w.EntryCount, &w.FilePath, &w.CreatedAt); err != nil {
			return nil, err
		}
		wls = append(wls, w)
	}
	return wls, rows.Err()
}

func GetWordlist(ctx context.Context, db *database.DB, id string) (*Wordlist, error) {
	var w Wordlist
	err := db.Pool.QueryRow(ctx,
		`SELECT id, name, type, entry_count, file_path, created_at FROM wordlists WHERE id = $1`, id,
	).Scan(&w.ID, &w.Name, &w.Type, &w.EntryCount, &w.FilePath, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func DeleteWordlist(ctx context.Context, db *database.DB, id string) error {
	_, err := db.Pool.Exec(ctx, `DELETE FROM wordlists WHERE id = $1`, id)
	return err
}
