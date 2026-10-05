package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/rinbarpen/llm-router/src/schemas"
)

func yearMonth(now time.Time) string {
	return now.UTC().Format("2006-01")
}

func currentPeriodBounds(periodType string) (start, end string, resolvedType string) {
	now := time.Now().UTC()
	switch periodType {
	case "daily":
		s := now.Format("2006-01-02")
		return s, s, "daily"
	case "weekly":
		weekday := now.Weekday()
		weekStart := now.AddDate(0, 0, -int(weekday))
		start = weekStart.Format("2006-01-02")
		end = weekStart.AddDate(0, 0, 6).Format("2006-01-02")
		return start, end, "weekly"
	default:
		return yearMonth(now), yearMonth(now), "monthly"
	}
}

func (s *CatalogService) GetAPIKeyMonthlyUsage(ctx context.Context, apiKeyID int64, ym string) (int64, float64, error) {
	var (
		tokens int64
		cost   float64
	)
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(total_tokens, 0), COALESCE(total_cost, 0)
		FROM api_key_usage_monthly
		WHERE api_key_id = $1 AND year_month = $2
	`, apiKeyID, ym).Scan(&tokens, &cost); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, 0, nil
		}
		return 0, 0, fmt.Errorf("query api key monthly usage: %w", err)
	}
	return tokens, cost, nil
}

func (s *CatalogService) CheckAPIKeyQuota(ctx context.Context, apiKeyID int64, quotaTokensMonthly int64) error {
	if quotaTokensMonthly <= 0 {
		return nil
	}
	tokens, _, err := s.GetAPIKeyMonthlyUsage(ctx, apiKeyID, yearMonth(time.Now()))
	if err != nil {
		return err
	}
	if tokens >= quotaTokensMonthly {
		return fmt.Errorf("monthly token quota exceeded")
	}
	return nil
}

func (s *CatalogService) CheckAPIKeyCostQuota(ctx context.Context, apiKeyID int64, quotaCostMonthly float64) error {
	if quotaCostMonthly <= 0 {
		return nil
	}
	_, cost, err := s.GetAPIKeyMonthlyUsage(ctx, apiKeyID, yearMonth(time.Now()))
	if err != nil {
		return err
	}
	if cost >= quotaCostMonthly {
		return fmt.Errorf("monthly cost quota exceeded")
	}
	return nil
}

func (s *CatalogService) AccumulateAPIKeyUsage(ctx context.Context, apiKeyID int64, tokens int64, cost float64) error {
	if apiKeyID <= 0 {
		return nil
	}
	if tokens < 0 {
		tokens = 0
	}
	if cost < 0 {
		cost = 0
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO api_key_usage_monthly(api_key_id, year_month, total_tokens, total_requests, total_cost, updated_at)
		VALUES($1, $2, $3, 1, $4, now())
		ON CONFLICT(api_key_id, year_month) DO UPDATE SET
			total_tokens = api_key_usage_monthly.total_tokens + EXCLUDED.total_tokens,
			total_requests = api_key_usage_monthly.total_requests + 1,
			total_cost = api_key_usage_monthly.total_cost + EXCLUDED.total_cost,
			updated_at = now()
	`, apiKeyID, yearMonth(time.Now()), tokens, cost)
	if err != nil {
		return fmt.Errorf("accumulate api key usage: %w", err)
	}
	if err := s.applyWalletDebitForAPIKey(ctx, apiKeyID, cost, tokens); err != nil && !errors.Is(err, ErrInsufficientBalance) {
		return fmt.Errorf("deduct wallet balance: %w", err)
	}
	return nil
}

// AccumulateAPIKeyUsageDetailed upserts into api_key_usage with per-source token breakdown.
func (s *CatalogService) AccumulateAPIKeyUsageDetailed(ctx context.Context, apiKeyID int64, b schemas.TokenBreakdown, cost float64) error {
	if apiKeyID <= 0 {
		return nil
	}
	periodStart, periodEnd, periodType := currentPeriodBounds("daily")
	_, err := s.pool.Exec(ctx, `
		INSERT INTO api_key_usage(api_key_id, period_start, period_end, period_type,
			total_tokens, total_requests, total_cost,
			input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, updated_at)
		VALUES($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, now())
		ON CONFLICT(api_key_id, period_type, period_start) DO UPDATE SET
			total_tokens = api_key_usage.total_tokens + EXCLUDED.total_tokens,
			total_requests = api_key_usage.total_requests + 1,
			total_cost = api_key_usage.total_cost + EXCLUDED.total_cost,
			input_tokens = api_key_usage.input_tokens + EXCLUDED.input_tokens,
			output_tokens = api_key_usage.output_tokens + EXCLUDED.output_tokens,
			cache_creation_input_tokens = api_key_usage.cache_creation_input_tokens + EXCLUDED.cache_creation_input_tokens,
			cache_read_input_tokens = api_key_usage.cache_read_input_tokens + EXCLUDED.cache_read_input_tokens,
			updated_at = now()
	`, apiKeyID, periodStart, periodEnd, periodType,
		b.TotalTokens, cost,
		b.PromptTokens, b.CompletionTokens, b.CacheCreationInputTokens, b.CacheReadInputTokens,
	)
	if err != nil {
		return fmt.Errorf("accumulate api key usage detailed: %w", err)
	}
	return nil
}

// CheckAPIKeyQuotaV2 enforces per-source token quotas from the API key's quota_config.
// quotaConfig format: {"period_type":"daily|weekly|monthly", "limits":{"total_tokens":N, "input_tokens":N, ...}}
func (s *CatalogService) CheckAPIKeyQuotaV2(ctx context.Context, apiKeyID int64, quotaConfig map[string]any) error {
	if len(quotaConfig) == 0 {
		return nil
	}
	periodType, _ := quotaConfig["period_type"].(string)
	if periodType == "" {
		periodType = "monthly"
	}
	limitsRaw, _ := quotaConfig["limits"].(map[string]any)
	if len(limitsRaw) == 0 {
		return nil
	}
	periodStart, _, _ := currentPeriodBounds(periodType)

	var usage struct {
		TotalTokens              int64
		InputTokens              int64
		OutputTokens             int64
		CacheCreationInputTokens int64
		CacheReadInputTokens     int64
		TotalCost                float64
	}
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(total_tokens,0), COALESCE(input_tokens,0), COALESCE(output_tokens,0),
			COALESCE(cache_creation_input_tokens,0), COALESCE(cache_read_input_tokens,0),
			COALESCE(total_cost,0)
		FROM api_key_usage
		WHERE api_key_id = $1 AND period_type = $2 AND period_start = $3
	`, apiKeyID, periodType, periodStart).Scan(
		&usage.TotalTokens, &usage.InputTokens, &usage.OutputTokens,
		&usage.CacheCreationInputTokens, &usage.CacheReadInputTokens, &usage.TotalCost,
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("query api key usage for quota check: %w", err)
	}

	for key, rawLimit := range limitsRaw {
		limit, ok := toInt64V2(rawLimit)
		if !ok || limit <= 0 {
			continue
		}
		var current int64
		switch key {
		case "total_tokens":
			current = usage.TotalTokens
		case "input_tokens":
			current = usage.InputTokens
		case "output_tokens":
			current = usage.OutputTokens
		case "cache_creation_input_tokens":
			current = usage.CacheCreationInputTokens
		case "cache_read_input_tokens":
			current = usage.CacheReadInputTokens
		case "total_cost":
			if usage.TotalCost >= float64(limit) {
				return fmt.Errorf("api key quota exceeded for %s: %.2f >= %d", key, usage.TotalCost, limit)
			}
			continue
		}
		if current >= limit {
			return fmt.Errorf("api key quota exceeded for %s: %d >= %d", key, current, limit)
		}
	}
	return nil
}

const defaultRetentionDays = 90

// PurgeExpiredTokenRecords deletes token usage records older than the configured retention period.
func (s *CatalogService) PurgeExpiredTokenRecords(ctx context.Context) error {
	var retentionDays int64 = defaultRetentionDays
	var enabled bool = true
	var lastCleanup *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT retention_days, enabled, last_cleanup_at
		FROM token_retention_config WHERE id = 1
	`).Scan(&retentionDays, &enabled, &lastCleanup)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			retentionDays = defaultRetentionDays
		} else {
			return fmt.Errorf("query token retention config: %w", err)
		}
	}
	if !enabled {
		return nil
	}
	if lastCleanup != nil && time.Since(*lastCleanup) < time.Hour {
		return nil
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -int(retentionDays))

	if _, err := s.pool.Exec(ctx, `
		DELETE FROM monitor_invocations WHERE started_at < $1
	`, cutoff); err != nil {
		return fmt.Errorf("purge monitor_invocations: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `
		DELETE FROM api_key_usage WHERE period_end < $1
	`, cutoff.Format("2006-01-02")); err != nil {
		return fmt.Errorf("purge api_key_usage: %w", err)
	}
	_, _ = s.pool.Exec(ctx, `
		UPDATE token_retention_config SET last_cleanup_at = now(), updated_at = now() WHERE id = 1
	`)
	return nil
}

// toInt64V2 converts any numeric type to int64. Duplicated from api/routes.go
// to avoid import cycle.
func toInt64V2(v any) (int64, bool) {
	switch t := v.(type) {
	case int:
		return int64(t), true
	case int32:
		return int64(t), true
	case int64:
		return t, true
	case float32:
		return int64(t), true
	case float64:
		return int64(t), true
	default:
		return 0, false
	}
}
