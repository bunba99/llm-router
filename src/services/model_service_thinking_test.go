package services

import (
	"testing"
)

func TestMapThinkingEffort_DirectMatch(t *testing.T) {
	supported := []string{"low", "medium", "high", "xhigh", "max"}
	tests := []struct {
		requested string
		want      string
	}{
		{"low", "low"},
		{"medium", "medium"},
		{"high", "high"},
		{"xhigh", "xhigh"},
		{"max", "max"},
	}
	for _, tt := range tests {
		got := mapThinkingEffort(tt.requested, supported)
		if got != tt.want {
			t.Errorf("mapThinkingEffort(%q, full) = %q, want %q", tt.requested, got, tt.want)
		}
	}
}

func TestMapThinkingEffort_UpwardCompatibility(t *testing.T) {
	// DeepSeek only supports high and max
	supported := []string{"high", "max"}
	tests := []struct {
		requested string
		want      string
	}{
		{"low", "high"},
		{"medium", "high"},
		{"high", "high"},
		{"xhigh", "max"},
		{"max", "max"},
	}
	for _, tt := range tests {
		got := mapThinkingEffort(tt.requested, supported)
		if got != tt.want {
			t.Errorf("mapThinkingEffort(%q, [high,max]) = %q, want %q", tt.requested, got, tt.want)
		}
	}
}

func TestMapThinkingEffort_OnlyHigh(t *testing.T) {
	supported := []string{"high"}
	tests := []struct {
		requested string
		want      string
	}{
		{"low", "high"},
		{"medium", "high"},
		{"high", "high"},
		{"xhigh", "high"},
		{"max", "high"},
	}
	for _, tt := range tests {
		got := mapThinkingEffort(tt.requested, supported)
		if got != tt.want {
			t.Errorf("mapThinkingEffort(%q, [high]) = %q, want %q", tt.requested, got, tt.want)
		}
	}
}

func TestMapThinkingEffort_EmptySupported(t *testing.T) {
	// No thinking_effort_levels configured -> passthrough
	got := mapThinkingEffort("high", nil)
	if got != "high" {
		t.Errorf("mapThinkingEffort(high, nil) = %q, want %q", got, "high")
	}
	got = mapThinkingEffort("low", []string{})
	if got != "low" {
		t.Errorf("mapThinkingEffort(low, []) = %q, want %q", got, "low")
	}
}

func TestThinkingEffortLevelsFromConfigRaw_Empty(t *testing.T) {
	got := thinkingEffortLevelsFromConfigRaw(nil)
	if got != nil {
		t.Errorf("thinkingEffortLevelsFromConfigRaw(nil) = %v, want nil", got)
	}
	got = thinkingEffortLevelsFromConfigRaw([]byte(`{}`))
	if got != nil {
		t.Errorf("thinkingEffortLevelsFromConfigRaw({}) = %v, want nil", got)
	}
}

func TestThinkingEffortLevelsFromConfigRaw(t *testing.T) {
	got := thinkingEffortLevelsFromConfigRaw([]byte(`{"thinking_effort_levels": ["high", "max"]}`))
	if len(got) != 2 || got[0] != "high" || got[1] != "max" {
		t.Errorf("thinkingEffortLevelsFromConfigRaw() = %v, want [high max]", got)
	}
}

func TestMapThinkingEffort_UnknownLevel(t *testing.T) {
	// Unknown requested level falls back to highest supported
	supported := []string{"low", "high"}
	got := mapThinkingEffort("ultra", supported)
	if got != "high" {
		t.Errorf("mapThinkingEffort(ultra, [low,high]) = %q, want %q", got, "high")
	}
}
