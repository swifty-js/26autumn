package main

// Command tags slices a video into fixed-length segments and produces
// cluster labels (short English descriptions) for each segment via a vision
// LLM, following the eino-based calling style of swifty_agent.
//
// Usage:
//
//	go run . -input video.mp4 -config config.json -output ./output

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/hangtiancheng/26autumn/docs/tags/internal/config"
	"github.com/hangtiancheng/26autumn/docs/tags/internal/pipeline"
)

func main() {
	var (
		configPath  = flag.String("config", "config.json", "path to config.json")
		input       = flag.String("input", "", "video file path (default: the only video in the current dir)")
		outputDir   = flag.String("output", "output", "output directory for frames and reports")
		segmentSecs = flag.Float64("segment", 0, "override segment length in seconds")
		frames      = flag.Int("frames", 0, "override frames per segment")
		concurrency = flag.Int("concurrency", 0, "override parallel segment workers")
	)
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if *segmentSecs > 0 {
		cfg.SegmentSeconds = *segmentSecs
	}
	if *frames > 0 {
		cfg.FramesPerSegment = *frames
	}
	if *concurrency > 0 {
		cfg.Concurrency = *concurrency
	}

	videoPath := *input
	if videoPath == "" {
		videoPath, err = findLocalVideo(".")
		if err != nil {
			log.Fatalf("input: %v", err)
		}
	}
	if _, err := os.Stat(videoPath); err != nil {
		log.Fatalf("input: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	err = pipeline.Run(ctx, pipeline.Options{
		VideoPath: videoPath,
		OutputDir: *outputDir,
		Config:    cfg,
	})
	if err != nil {
		log.Fatalf("pipeline: %v", err)
	}
}

// findLocalVideo returns the single video file in dir, erroring when there
// is none or more than one (to avoid guessing).
func findLocalVideo(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	exts := map[string]bool{".mp4": true, ".mov": true, ".mkv": true, ".flv": true, ".webm": true, ".ts": true}
	var found []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if exts[filepath.Ext(e.Name())] {
			found = append(found, filepath.Join(dir, e.Name()))
		}
	}
	switch len(found) {
	case 0:
		return "", os.ErrNotExist
	case 1:
		return found[0], nil
	default:
		return "", &multiVideoError{paths: found}
	}
}

type multiVideoError struct {
	paths []string
}

func (e *multiVideoError) Error() string {
	msg := "multiple videos found, specify one with -input:"
	for _, p := range e.paths {
		msg += "\n  " + p
	}
	return msg
}
