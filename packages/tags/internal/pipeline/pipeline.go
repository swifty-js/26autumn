package pipeline

// Package pipeline orchestrates the whole flow: probe duration, plan
// segments, then per segment extract frames and call the vision LLM with a
// bounded worker pool, finally writing JSON and markdown reports.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/hangtiancheng/26autumn/docs/tags/internal/config"
	"github.com/hangtiancheng/26autumn/docs/tags/internal/labeler"
	"github.com/hangtiancheng/26autumn/docs/tags/internal/llm"
	"github.com/hangtiancheng/26autumn/docs/tags/internal/slicer"
)

// Options carries the resolved runtime parameters.
type Options struct {
	VideoPath string
	OutputDir string
	Config    *config.Config
}

// SegmentResult is one row of the final report.
type SegmentResult struct {
	Index   int      `json:"index"`
	Start   float64  `json:"start"`
	End     float64  `json:"end"`
	Labels  []string `json:"labels"`
	Summary string   `json:"summary"`
}

// Report is the JSON output structure.
type Report struct {
	Video           string          `json:"video"`
	DurationSeconds float64         `json:"duration_seconds"`
	SegmentSeconds  float64         `json:"segment_seconds"`
	Segments        []SegmentResult `json:"segments"`
}

// Run executes the full slicing + labeling pipeline.
func Run(ctx context.Context, opts Options) error {
	cfg := opts.Config
	if err := slicer.CheckTools(); err != nil {
		return err
	}

	duration, err := slicer.ProbeDuration(ctx, opts.VideoPath)
	if err != nil {
		return err
	}
	segments := slicer.PlanSegments(duration, cfg.SegmentSeconds)
	log.Printf("video %s duration %s, %d segments of %.0fs",
		filepath.Base(opts.VideoPath), slicer.FormatTime(duration), len(segments), cfg.SegmentSeconds)

	chatModel, err := llm.NewChatModel(ctx, cfg)
	if err != nil {
		return fmt.Errorf("create chat model: %w", err)
	}
	lb := labeler.New(chatModel)

	framesDir := filepath.Join(opts.OutputDir, "frames")
	results := make([]SegmentResult, len(segments))
	errs := make([]error, len(segments))

	sem := make(chan struct{}, cfg.Concurrency)
	var wg sync.WaitGroup
	for i, seg := range segments {
		wg.Add(1)
		go func(i int, seg slicer.Segment) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i], errs[i] = processSegment(ctx, opts.VideoPath, framesDir, cfg, lb, seg)
			if errs[i] != nil {
				log.Printf("segment %d (%s - %s) failed: %v",
					seg.Index, slicer.FormatTime(seg.Start), slicer.FormatTime(seg.End), errs[i])
				return
			}
			log.Printf("segment %d (%s - %s) labels: %s",
				seg.Index, slicer.FormatTime(seg.Start), slicer.FormatTime(seg.End),
				strings.Join(results[i].Labels, " / "))
		}(i, seg)
	}
	wg.Wait()

	// Every segment MUST carry at least one label: a hard failure (frame
	// extraction or LLM error) degrades to a fallback label instead of
	// aborting the whole run.
	report := Report{
		Video:           opts.VideoPath,
		DurationSeconds: duration,
		SegmentSeconds:  cfg.SegmentSeconds,
	}
	for i := range segments {
		if errs[i] != nil {
			results[i].Labels = []string{"未能识别内容"}
			results[i].Summary = errs[i].Error()
		}
		report.Segments = append(report.Segments, results[i])
	}
	sort.Slice(report.Segments, func(a, b int) bool { return report.Segments[a].Index < report.Segments[b].Index })

	if err := writeOutputs(opts.OutputDir, report); err != nil {
		return err
	}
	log.Printf("done: %d segments labeled, results in %s", len(report.Segments), opts.OutputDir)
	return nil
}

// processSegment handles one segment: extract frames then label them.
func processSegment(ctx context.Context, videoPath, framesDir string, cfg *config.Config, lb *labeler.Labeler, seg slicer.Segment) (SegmentResult, error) {
	res := SegmentResult{Index: seg.Index, Start: seg.Start, End: seg.End}
	frames, err := slicer.ExtractFrames(ctx, videoPath, seg, cfg.FramesPerSegment, cfg.FrameWidth, framesDir)
	if err != nil {
		return res, err
	}
	seg.Frames = frames
	lr, err := lb.LabelSegment(ctx, seg)
	if err != nil {
		return res, err
	}
	res.Labels = lr.Labels
	res.Summary = lr.Summary
	return res, nil
}

// writeOutputs persists tags_result.json and tags_report.md.
func writeOutputs(dir string, report Report) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "tags_result.json"), data, 0o644); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "tags_report.md"), []byte(renderMarkdown(report)), 0o644)
}

// renderMarkdown builds a human-readable timeline report.
func renderMarkdown(report Report) string {
	var b strings.Builder
	b.WriteString("# 视频聚类标签结果\n\n")
	fmt.Fprintf(&b, "- 视频: %s\n", filepath.Base(report.Video))
	fmt.Fprintf(&b, "- 时长: %s\n", slicer.FormatTime(report.DurationSeconds))
	fmt.Fprintf(&b, "- 切片粒度: %.0fs, 共 %d 个切片\n\n", report.SegmentSeconds, len(report.Segments))
	b.WriteString("| 切片 | 时间范围 | 聚类标签 | 内容总结 |\n")
	b.WriteString("| --- | --- | --- | --- |\n")
	for _, seg := range report.Segments {
		fmt.Fprintf(&b, "| %d | %s - %s | %s | %s |\n",
			seg.Index+1,
			slicer.FormatTime(seg.Start), slicer.FormatTime(seg.End),
			strings.Join(seg.Labels, " / "),
			seg.Summary,
		)
	}
	return b.String()
}
