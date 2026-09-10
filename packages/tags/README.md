# tags

A Go CLI that slices a video into fixed-length segments, extracts representative
frames from each, and labels every segment with short English cluster descriptions
using a vision LLM — following the [eino](https://github.com/cloudwego/eino)-based
calling style of `swifty_agent`.

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-f5a623.svg)

## What it does

1. **Probe** the video duration with `ffprobe`.
2. **Plan** fixed-length segments (configurable, default 60s).
3. **Slice** each segment and extract `frames_per_segment` representative frames
   (scaled to `frame_width` px to control token cost).
4. **Label** each segment by sending its frames to a vision LLM (OpenAI-compatible
   or Anthropic/Claude), with a bounded worker pool for concurrency and retries for
   malformed replies.
5. **Report** results as JSON (`report.json`) and Markdown, with extracted frames
   saved under `output/frames/`.

## Requirements

- **Go 1.26+**
- **ffmpeg** and **ffprobe** on `PATH` (e.g. `brew install ffmpeg`)
- A vision-capable LLM endpoint (OpenAI-compatible or Claude)

## Usage

Copy the example config and fill in your credentials:

```sh
cp config.example.jsonc config.json
```

Then run:

```sh
go run . -input video.mp4 -config config.json -output ./output
```

| Flag           | Description                                        |
| -------------- | -------------------------------------------------- |
| `-input`       | Video path (defaults to the only video in the dir) |
| `-config`      | Path to `config.json` (default `config.json`)      |
| `-output`      | Output directory for frames and reports            |
| `-segment`     | Override segment length in seconds                 |
| `-frames`      | Override frames extracted per segment              |
| `-concurrency` | Override parallel segment workers                  |

## Configuration

```jsonc
{
  // "openai" = any OpenAI-compatible endpoint; "anthropic" = Claude.
  "model_provider": "openai",
  "chat_model": {
    "api_key": "your-api-key",
    "base_url": "https://ark.cn-beijing.volces.com/api/v3",
    "model": "doubao-seed-1.6-vision-250715", // must be a vision model (VLM)
    "max_tokens": 1024,
  },
  "segment_seconds": 60, // slicing granularity
  "frames_per_segment": 3, // representative frames per segment
  "concurrency": 2, // parallel segment workers
  "frame_width": 768, // frame width in px; height keeps aspect ratio
}
```

## Output

```
output/
├── frames/           # extracted representative frames per segment
├── report.json       # structured segment labels & summaries
└── report.md         # human-readable summary
```

Each segment result carries an `index`, `start`/`end` timestamps, a list of
cluster labels (capped at 5), and a one-line summary.

## Layout

```
tags/
├── internal/
│   ├── config/     # config loading + validation
│   ├── slicer/     # ffprobe/ffmpeg orchestration
│   ├── llm/        # eino chat-model construction
│   ├── labeler/    # vision-LLM labeling + JSON parsing
│   └── pipeline/   # end-to-end orchestration
├── main.go
└── config.json     # (gitignored) your local config
```
