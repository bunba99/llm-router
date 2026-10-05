package config

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// ResolveModelConfigPath finds router.toml (or another relative path) by walking up from cwd.
func ResolveModelConfigPath(relativeOrAbs string) (string, error) {
	p := strings.TrimSpace(relativeOrAbs)
	if p == "" {
		p = "router.toml"
	}
	if filepath.IsAbs(p) {
		if _, err := os.Stat(p); err != nil {
			return "", err
		}
		return p, nil
	}
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := wd; ; dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, p)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	return "", fmt.Errorf("model config file not found: %q (searched upward from %s)", p, wd)
}

// ResolveModelConfigPathRobust works like ResolveModelConfigPath but falls back to the executable directory
// if the cwd-based search fails. This prevents silent Bootstrap failure when the app is started from a
// non-project directory.
func ResolveModelConfigPathRobust(relativeOrAbs string) (string, error) {
	resolved, err := ResolveModelConfigPath(relativeOrAbs)
	if err == nil {
		return resolved, nil
	}
	slog.Warn("llm-router config: cwd-based config search failed, trying executable directory",
		slog.String("path", relativeOrAbs),
		slog.Any("error", err),
	)
	exe, exeErr := os.Executable()
	if exeErr != nil {
		return "", err
	}
	exeDir := filepath.Dir(exe)
	fileName := strings.TrimSpace(relativeOrAbs)
	if fileName == "" {
		fileName = "router.toml"
	}
	candidate := filepath.Join(exeDir, filepath.Base(fileName))
	if _, statErr := os.Stat(candidate); statErr != nil {
		return "", err
	}
	slog.Info("llm-router config: found config via executable directory", slog.String("path", candidate))
	return candidate, nil
}
