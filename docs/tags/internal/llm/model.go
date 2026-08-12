// Package llm provides the chat model factory. It mirrors
// swifty_agent/internal/ai/models: the provider is selected via
// config.ModelProvider, defaulting to the OpenAI-compatible implementation
// unless "anthropic" is explicitly configured.
package llm

import (
	"context"
	"fmt"

	"github.com/cloudwego/eino-ext/components/model/claude"
	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/components/model"

	"github.com/hangtiancheng/26autumn/docs/tags/internal/config"
)

// NewChatModel builds a chat model from the config. The returned model is
// used for one-shot (non-streaming) Generate calls with multimodal input.
func NewChatModel(ctx context.Context, cfg *config.Config) (model.ChatModel, error) {
	mc := cfg.ChatModel
	switch cfg.ModelProvider {
	case config.ModelProviderAnthropic:
		// Claude's BaseURL is optional; nil falls back to the default
		// Anthropic endpoint. The SDK auto-appends /v1/messages, so
		// base_url must NOT include /v1.
		var baseURL *string
		if mc.BaseURL != "" {
			baseURL = &mc.BaseURL
		}
		return claude.NewChatModel(ctx, &claude.Config{
			APIKey:    mc.APIKey,
			BaseURL:   baseURL,
			Model:     mc.Model,
			MaxTokens: mc.MaxTokens,
		})
	case config.ModelProviderOpenAI:
		// Works with any OpenAI-compatible endpoint (base_url used as-is,
		// typically includes /v1).
		return openai.NewChatModel(ctx, &openai.ChatModelConfig{
			Model:   mc.Model,
			APIKey:  mc.APIKey,
			BaseURL: mc.BaseURL,
		})
	default:
		return nil, fmt.Errorf("unsupported model_provider %q", cfg.ModelProvider)
	}
}
