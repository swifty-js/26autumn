package config

// Package config loads the video tagging configuration from a JSON file.
// The layout mirrors swifty_agent's config.json: a model_provider selector
// plus a chat model block carrying api_key / base_url / model / max_tokens.

import (
	"encoding/json"
	"fmt"
	"os"
)

// Model providers supported by the llm factory.
const (
	ModelProviderOpenAI    = "openai"
	ModelProviderAnthropic = "anthropic"
)

// ChatModelConfig describes one LLM endpoint.
type ChatModelConfig struct {
	APIKey    string `json:"api_key"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	MaxTokens int    `json:"max_tokens"`
}

// Config is the root configuration object.
type Config struct {
	// ModelProvider selects the underlying chat model implementation,
	// "openai" (any OpenAI-compatible endpoint) or "anthropic".
	ModelProvider string          `json:"model_provider"`
	ChatModel     ChatModelConfig `json:"chat_model"`

	// SegmentSeconds is the fixed slicing granularity in seconds.
	SegmentSeconds float64 `json:"segment_seconds"`
	// FramesPerSegment is how many representative frames are extracted
	// from each segment and fed to the vision model.
	FramesPerSegment int `json:"frames_per_segment"`
	// Concurrency limits how many segments are labeled in parallel.
	Concurrency int `json:"concurrency"`
	// FrameWidth is the width (px) frames are scaled down to before
	// encoding, to control token cost. Height keeps aspect ratio.
	FrameWidth int `json:"frame_width"`
}

// Load reads and validates the config file at path, applying defaults for
// optional slicing knobs.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	cfg.applyDefaults()
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) applyDefaults() {
	if c.ModelProvider == "" {
		c.ModelProvider = ModelProviderOpenAI
	}
	if c.SegmentSeconds <= 0 {
		c.SegmentSeconds = 60
	}
	if c.FramesPerSegment <= 0 {
		c.FramesPerSegment = 3
	}
	if c.Concurrency <= 0 {
		c.Concurrency = 2
	}
	if c.FrameWidth <= 0 {
		c.FrameWidth = 768
	}
	if c.ChatModel.MaxTokens <= 0 {
		c.ChatModel.MaxTokens = 1024
	}
}

func (c *Config) validate() error {
	if c.ModelProvider != ModelProviderOpenAI && c.ModelProvider != ModelProviderAnthropic {
		return fmt.Errorf("unsupported model_provider %q, want %q or %q",
			c.ModelProvider, ModelProviderOpenAI, ModelProviderAnthropic)
	}
	if c.ChatModel.APIKey == "" || c.ChatModel.APIKey == "your-api-key" {
		return fmt.Errorf("chat_model.api_key is not configured")
	}
	if c.ChatModel.Model == "" {
		return fmt.Errorf("chat_model.model is not configured")
	}
	return nil
}
